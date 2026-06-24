import asyncio
import asyncssh
from fastapi import FastAPI
import uvicorn
from app.core.logging import logger
from typing import Dict, Tuple, Optional
import os
import shlex
from app.utils.ssh_aes_util import decrypt_password
from app.utils.ssh_validata_util import ssh_authenticate_user, find_key_by_comment

HOST_KEY_FILE = "ssh_host_key"
# 连接池：每个客户端 peer -> upstream SSHClientConnection
upstream_connections: Dict[Tuple[str, int], asyncssh.SSHClientConnection] = {}
# 认证缓存：peer -> {username, password}
auth_credentials: Dict[Tuple[str, int], dict] = {}
# 远端探测得到的 PATH 前缀缓存：peer -> 探测结果（"" 表示已尝试且未命中）
discovered_paths: Dict[Tuple[str, int], str] = {}

# 方案 1：在远端 /usr/local/python*/bin 中找第一个可执行的 python，输出该 bin 目录
_REMOTE_SCAN_PYTHON_DIR_CMD = (
    "for d in /usr/local/python*/bin; do "
    "[ -x \"$d/python\" ] && printf '%s' \"$d\" && break; "
    "done"
)

# 方案 2：找到 Jupyter 进程，读取其 /proc/<pid>/environ 中的 PATH
_REMOTE_READ_JUPYTER_PATH_CMD = (
    "pid=\"\"; "
    "if command -v pgrep >/dev/null 2>&1; then "
    "  pid=$(pgrep -f jupyter 2>/dev/null | head -n1); "
    "fi; "
    "if [ -z \"$pid\" ]; then "
    "  for f in /proc/[0-9]*/cmdline; do "
    "    cmd=$(tr '\\0' ' ' < \"$f\" 2>/dev/null); "
    "    case \"$cmd\" in "
    "      *jupyter*) pid=${f#/proc/}; pid=${pid%/cmdline}; break;; "
    "    esac; "
    "  done; "
    "fi; "
    "if [ -n \"$pid\" ] && [ -r \"/proc/$pid/environ\" ]; then "
    "  tr '\\0' '\\n' < /proc/$pid/environ 2>/dev/null | sed -n 's/^PATH=//p' | head -n1; "
    "fi"
)


def ensure_host_key():
    if not os.path.exists(HOST_KEY_FILE):
        logger.info("生成 host key...")
        os.system(f"ssh-keygen -t rsa -b 2048 -N '' -f {HOST_KEY_FILE}")


async def _run_remote(upstream: asyncssh.SSHClientConnection, cmd: str) -> str:
    try:
        result = await upstream.run(cmd, check=False)
    except Exception as e:
        logger.debug(f"远端命令执行失败: {e}")
        return ""
    out = result.stdout
    if isinstance(out, bytes):
        out = out.decode("utf-8", errors="ignore")
    return (out or "").strip()


async def _discover_remote_path_prepend(upstream: asyncssh.SSHClientConnection) -> Optional[str]:
    bin_dir = await _run_remote(upstream, _REMOTE_SCAN_PYTHON_DIR_CMD)
    if bin_dir:
        logger.info(f"远端 PATH 探测命中（方案1 目录扫描）: {bin_dir}")
        return bin_dir

    jupyter_path = await _run_remote(upstream, _REMOTE_READ_JUPYTER_PATH_CMD)
    if jupyter_path:
        logger.info(f"远端 PATH 探测命中（方案2 Jupyter 进程环境）: {jupyter_path}")
        return jupyter_path

    logger.info("远端 PATH 探测未命中，保持原 PATH")
    return None


async def _ensure_path_prepend(peer: Optional[Tuple[str, int]],
                               upstream: asyncssh.SSHClientConnection) -> str:
    if peer is None:
        return await _discover_remote_path_prepend(upstream) or ""

    if peer in discovered_paths:
        return discovered_paths[peer]

    found = await _discover_remote_path_prepend(upstream) or ""
    discovered_paths[peer] = found
    return found


def _build_upstream_env(env: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """只保留客户端传过来的环境，不再尝试通过 SSH env 通道传 PATH。
    多数 sshd 默认不在 AcceptEnv 中允许 PATH，强行注入也会被丢弃。
    PATH 的注入改由 _wrap_with_path_prepend 在远端 shell 内部完成。
    """
    return dict(env or {})


def _wrap_with_path_prepend(path_prepend: Optional[str], inner: Optional[str]) -> Optional[str]:
    """生成一段在远端执行的命令：先把 path_prepend 追加到 PATH 前，再执行原命令/shell。

    inner 为 None 表示交互式 shell，会 exec bash -l。
    inner 非 None 表示客户端要求执行的命令，会 exec bash -c inner。
    若 path_prepend 为空，返回 inner 原值（None 表示沿用默认 shell 行为）。
    """
    if not path_prepend:
        return inner

    prefix = f'export PATH={shlex.quote(path_prepend)}":$PATH"; '

    if inner is None:
        return prefix + "exec bash -l"

    return prefix + f"exec bash -c {shlex.quote(inner)}"


class ProxySSHServer(asyncssh.SSHServer):
    def __init__(self):
        self._conn = None
        self._peer = None

    def connection_made(self, conn):
        self._conn = conn
        self._peer = conn.get_extra_info("peername")
        logger.info(f"新连接: {self._peer}")

    def begin_auth(self, username):
        # 要求密码认证
        return True

    def password_auth_supported(self):
        return True

    async def validate_password(self, username, password):
        """把凭据用于连接后端验证；验证成功则缓存 upstream 连接"""
        peer = self._peer

        # 获取到的notebook信息
        notebook = await ssh_authenticate_user(username, True, password)

        if not notebook:
            logger.warning(f"网关认证失败: {username}", )
            return False

        try:
            logger.info(f"用凭据验证后端: {username}@{notebook.ssh_address}:{notebook.ssh_port}")
            # 建立到后端的上游 SSH 连接（保存并复用）
            upstream = await asyncssh.connect(
                notebook.ssh_address,
                port=notebook.ssh_port,
                username="root",
                password=decrypt_password(notebook.secret),
                known_hosts=None,
                encoding=None,
            )
            # 缓存
            if peer:
                upstream_connections[peer] = upstream
                auth_credentials[peer] = {"ssh_address": notebook.ssh_address,
                                          "ssh_port": notebook.ssh_port,
                                          "username": "root",
                                          "password": decrypt_password(notebook.secret)}
            logger.info(f"后端认证成功并建立上游连接：{peer}", )
            return True
        except asyncssh.PermissionDenied:
            logger.warning(f"后端认证失败（权限）: {username}", )
            return False
        except Exception as e:
            logger.warning(f"后端连接/认证异常: {e}", )
            return False

    def public_key_auth_supported(self):
        return True

    async def validate_public_key(self, username, key):
        """允许网关用户使用预先配置的公钥认证"""

        # 获取到的notebook信息
        notebook = await ssh_authenticate_user(username, False)
        if not notebook:
            logger.warning(f"网关认证失败: {username}", )
            return False

        # 根据 notebook_id@jump 对应的注释找到该 Notebook 的授权公钥
        allowed_key = await find_key_by_comment(notebook.id)
        if not allowed_key:
            logger.warning(f"未找到 {username} 对应的公钥")
            return False

        if key == allowed_key:
            # 公钥匹配，建立到后端的连接
            try:
                upstream = await asyncssh.connect(
                    notebook.ssh_address,
                    port=notebook.ssh_port,
                    username="root",
                    password=decrypt_password(notebook.secret),
                    known_hosts=None,
                    encoding=None,
                )
                peer = self._peer
                if peer:
                    upstream_connections[peer] = upstream
                    auth_credentials[peer] = {"ssh_address": notebook.ssh_address,
                                              "ssh_port": notebook.ssh_port,
                                              "username": "root",
                                              "password": decrypt_password(notebook.secret)}
                logger.info(f"后端认证成功（公钥）并建立上游连接：{peer}")
                return True
            except Exception as e:
                logger.warning(f"后端连接/认证异常: {e}")
                return False

    def connection_lost(self, exc):
        # 清理缓存
        if self._peer:
            upstream = upstream_connections.pop(self._peer, None)
            if upstream:
                try:
                    upstream.close()
                except Exception:
                    pass
            auth_credentials.pop(self._peer, None)
            discovered_paths.pop(self._peer, None)
        logger.info(f"连接断开: {exc}")

    def session_closed(self):
        # 清理缓存
        if self._peer:
            upstream = upstream_connections.pop(self._peer, None)
            if upstream:
                try:
                    upstream.close()
                except Exception:
                    pass
            auth_credentials.pop(self._peer, None)
            discovered_paths.pop(self._peer, None)
        print("会话已关闭")

    def connection_requested(self, dest_host, dest_port, orig_host, orig_port):
        """
        处理 direct-tcpip（ProxyJump/ProxyCommand式）请求：
        如果已有上游 SSHClientConnection，直接返回它 —— asyncssh 会把 direct-tcpip 隧道到该连接上。
        否则返回一个 coroutine 来创建上游连接并返回它（asyncssh 会 await）。
        """
        peer = self._peer
        logger.info(f"direct-tcpip 请求: {dest_host}:{dest_port} <- {orig_host}:{orig_port} (peer={peer})")

        upstream = upstream_connections.get(peer)
        if upstream:
            # 返回 SSHClientConnection：asyncssh 会在上游上打开连接隧道
            return upstream

        # 没有上游则尝试创建（返回 awaitable）
        async def _make_upstream_and_return():
            creds = auth_credentials.get(peer)
            if not creds:
                raise asyncssh.ChannelOpenError(asyncssh.OPEN_CONNECT_FAILED, "no credentials")
            conn = await asyncssh.connect(
                creds["ssh_address"],
                port=creds["ssh_port"],
                username=creds["username"],
                password=creds["password"],
                known_hosts=None,
                encoding=None,
            )
            upstream_connections[peer] = conn
            return conn

        return _make_upstream_and_return()


async def handle_client(process: asyncssh.SSHServerProcess):
    """
    将客户端会话透明桥接到 upstream（上游 SSH）。
    兼容 open_session() 返回三元组或者 SSHClientProcess 对象。
    """
    logger.info("公钥认证开始")
    conn = process.get_extra_info("connection")
    logger.info(f"公钥认证conn: {conn}")
    if not conn:
        await _safe_write_err_exit(process, "无法获取 connection 信息\n")
        return
    peer = conn.get_extra_info("peername")
    upstream = upstream_connections.get(peer)
    logger.info(f"公钥认证upstream: {upstream}")
    # 若还没有上游连接，用缓存的凭据建立
    if not upstream:
        creds = auth_credentials.get(peer)
        if not creds:
            await _safe_write_err_exit(process, "无法获取认证凭据\n")
            return
        try:
            upstream = await asyncssh.connect(
                creds["ssh_address"],
                port=creds["ssh_port"],
                username=creds["username"],
                password=creds["password"],
                known_hosts=None,
                encoding=None,
            )
            upstream_connections[peer] = upstream
        except Exception as e:
            await _safe_write_err_exit(process, f"上游连接失败: {e}\n")
            return

    # 判定会话类型（subsystem / exec / shell）
    try:
        cmd = getattr(process, "command", None)
        if cmd is None and hasattr(process, "get_command"):
            try:
                cmd = process.get_command()
            except Exception:
                cmd = None

        subsystem = None
        if hasattr(process, "get_subsystem"):
            try:
                subsystem = process.get_subsystem()
            except Exception:
                subsystem = None

        term_type = None
        term_size = None
        if hasattr(process, "get_terminal_type"):
            term_type = process.get_terminal_type()
        if hasattr(process, "get_terminal_size"):
            term_size = process.get_terminal_size()

        path_prepend = await _ensure_path_prepend(peer, upstream)
        upstream_env = _build_upstream_env(process.env)

        # 打开上游会话（encoding=None -> bytes 模式）
        if subsystem:
            up = await upstream.open_session(subsystem=subsystem, env=upstream_env, encoding=None)
        elif cmd:
            cmd_str = cmd if isinstance(cmd, str) else cmd.decode("utf-8", errors="ignore")
            wrapped_cmd = _wrap_with_path_prepend(path_prepend, cmd_str)
            up = await upstream.create_process(command=wrapped_cmd, env=upstream_env, encoding=None)
        else:
            shell_cmd = _wrap_with_path_prepend(path_prepend, None)
            if shell_cmd:
                up = await upstream.create_process(command=shell_cmd, term_type=term_type,
                                                  term_size=term_size, env=upstream_env, encoding=None)
            else:
                up = await upstream.create_process(term_type=term_type, term_size=term_size,
                                                  env=upstream_env, encoding=None)

        # 兼容 open_session 返回形式：
        # - 如果返回的是一个三元组 (stdin, stdout, stderr)
        # - 或者返回 SSHClientProcess 对象（具有 .stdin/.stdout/.stderr）。
        try:
            # 三元组情形
            up_stdin, up_stdout, up_stderr = up
        except Exception:
            # SSHClientProcess 情形
            up_stdin = up.stdin
            up_stdout = up.stdout
            up_stderr = up.stderr

        # 转发：客户端 -> 上游 stdin
        async def client_to_upstream():
            try:
                while True:
                    data = await process.stdin.read(32768)  # bytes 或 None
                    if not data:
                        try:
                            up_stdin.write_eof()
                        except Exception:
                            pass
                        break
                    # 确保写 bytes
                    if isinstance(data, str):
                        data = data.encode("utf-8", errors="ignore")
                    up_stdin.write(data)
                    await up_stdin.drain()
            except Exception as e:
                logger.debug(f"client->upstream 结束: {e}")

        # 转发：上游 stdout -> 客户端 stdout
        async def upstream_stdout_to_client():
            try:
                while True:
                    data = await up_stdout.read(32768)
                    if not data:
                        break
                    # 确保写 bytes
                    if isinstance(data, str):
                        data = data.encode("utf-8", errors="ignore")
                    process.stdout.write(data)
            except Exception as e:
                logger.debug(f"up_stdout->client 结束: {e}")

        # 转发：上游 stderr -> 客户端 stderr
        async def upstream_stderr_to_client():
            try:
                while True:
                    data = await up_stderr.read(32768)
                    if not data:
                        break
                    if isinstance(data, str):
                        data = data.encode("utf-8", errors="ignore")
                    process.stderr.write(data)
            except Exception as e:
                logger.debug(f"up_stderr->client 结束: {e}")

        await asyncio.gather(client_to_upstream(), upstream_stdout_to_client(), upstream_stderr_to_client())
        process.exit(0)

    except Exception as e:
        logger.exception("桥接失败")
        await _safe_write_err_exit(process, f"桥接失败: {e}\n")


async def _safe_write_err_exit(process: asyncssh.SSHServerProcess, msg: str):
    """帮助函数：给 process.stderr 写 bytes 并退出"""
    try:
        process.stderr.write(msg.encode("utf-8"))
    except Exception:
        pass
    try:
        process.exit(1)
    except Exception:
        pass


async def start_ssh_server():
    ensure_host_key()
    await asyncssh.listen(
        "", 2222,
        server_factory=ProxySSHServer,
        process_factory=handle_client,
        server_host_keys=[HOST_KEY_FILE],
        encoding=None,  # 非文本模式，保证 read/readline 返回 bytes
    )
    logger.info("SSH 跳板网关已启动，监听 2222...")
