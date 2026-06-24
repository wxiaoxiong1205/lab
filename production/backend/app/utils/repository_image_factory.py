from app.core.logging import logger

import volcenginesdkcore
import volcenginesdkcr
from volcenginesdkcore.rest import ApiException
import asyncio
import httpx
from httpx import HTTPStatusError, RequestError
from typing import List, Optional
from urllib.parse import quote
from typing import Dict, Any, Tuple
import traceback

from app.schemas.repository import RepositoryType


class RepositoryImageFactory:
    @staticmethod
    async def create_checker(repository_type, *args, **kwargs):
        if repository_type == RepositoryType.VOLCENGINE.value:
            return VolcengineChecker(*args, **kwargs)
        elif repository_type == RepositoryType.PRIVATE_HARBOR.value:
            return PrivateHarborChecker(*args, **kwargs)
        else:
            raise ValueError(f"Unsupported repository type: {repository_type}")


class VolcengineChecker:
    def __init__(self, url,access_key, secret_key, registry, region):
        self.url = url
        self.registry = registry
        configuration = volcenginesdkcore.Configuration()
        configuration.ak = access_key
        configuration.sk = secret_key
        configuration.region = region
        # set default configuration
        volcenginesdkcore.Configuration.set_default(configuration)
        # use global default configuration
        self.api_instance = volcenginesdkcr.CRApi()

    async def test_connectivity(self):
        """返回 火山云镜像仓库 所有命名空间名称（字符串列表）"""
        list_registries_request = volcenginesdkcr.ListRegistriesRequest(
        )
        try:
            self.api_instance.list_registries(list_registries_request)
            return True
        except ApiException as e:
            # 复制代码运行示例，请自行打印API错误信息。
            raise ValueError(f"connectivity repository Error: {e}")

    async def get_projects(self, namespaces:str = None, page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """返回 火山云镜像仓库 所有命名空间名称（字符串列表）"""
        req_filter = None
        if namespaces:
            req_filter = volcenginesdkcr.FilterForListNamespacesInput(
                names=[f"*{namespaces}*"],
            )
        list_namespaces_request = volcenginesdkcr.ListNamespacesRequest(
            filter=req_filter,
            registry=self.registry,
            page_number=page,
            page_size=page_size,
        )
        namespaces = []
        total = 0
        try:
            # 复制代码运行示例，请自行打印API返回值。
            data = self.api_instance.list_namespaces(
                list_namespaces_request,
                async_req=True)

            total = data.get().total_count
            for item in data.get().items:
                namespaces.append(item.name)
        except ApiException as e:
            # 复制代码运行示例，请自行打印API错误信息。
            # print("Exception when calling api: %s\n" % e)
            raise ValueError(f"connectivity repository Error: {e}")

        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "data": namespaces,
        }


    async def get_images(self, namespace:str, name:str = None, page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        # 获取命名空间下的列表
        names = None
        if name:
            names = [f"*{name}*"]
        req_filter = volcenginesdkcr.FilterForListRepositoriesInput(
            namespaces=[namespace],
            names=names,
        )
        list_repositories_request = volcenginesdkcr.ListRepositoriesRequest(
            filter=req_filter,
            page_number=page,
            page_size=page_size,
            registry=self.registry,
        )
        images = []
        total = 0
        try:
            data = self.api_instance.list_repositories(list_repositories_request, async_req=True)
            total = data.get().total_count
            for item in data.get().items:
                # 查询镜像版本
                list_tags_request = volcenginesdkcr.ListTagsRequest(
                    namespace=item.namespace,
                    page_number=1,
                    page_size=100,
                    registry=self.registry,
                    repository=item.name,
                )
                try:
                    tags_data = self.api_instance.list_tags(list_tags_request)
                    for tags in tags_data.items:
                        images.append(f"{tags_data.repository}:{tags.name}")
                except ApiException as e:
                    # 复制代码运行示例，请自行打印API错误信息。
                    # print("Exception when calling api: %s\n" % e)
                    raise ValueError(f"connectivity repository Error: {e}")
        except ApiException as e:
            # 复制代码运行示例，请自行打印API错误信息。
            # print("Exception when calling api: %s\n" % e)
            raise ValueError(f"connectivity repository Error: {e}")

        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "data": images,
        }

    async def check_tag_exists(self, namespace: str, repository: str, tag: str) -> bool:
        """检查指定的 tag 是否存在"""
        try:
            req_filter = volcenginesdkcr.FilterForListTagsInput(
                names=[f"{tag}"],
            )
            list_tags_request = volcenginesdkcr.ListTagsRequest(
                namespace=namespace,
                registry=self.registry,
                repository=repository,
                filter=req_filter,
            )
            tags_data = self.api_instance.list_tags(list_tags_request)
            return tags_data.total_count > 0
        except ApiException as e:
            # 如果查询失败（可能是镜像不存在），返回 False
            logger.warning(f"查询火山云镜像标签失败: {e}")
            return False

    async def delete_tags(self, namespace: str, repository: str, tags: List[str]) -> None:
        """删除火山云镜像仓库的标签"""
        try:
            delete_tags_request = volcenginesdkcr.DeleteTagsRequest(
                names=tags,
                namespace=namespace,
                registry=self.registry,
                repository=repository,
            )
            self.api_instance.delete_tags(delete_tags_request)
            logger.info(f"成功删除火山云镜像标签: {namespace}/{repository}:{tags}")
        except ApiException as e:
            logger.error(f"删除火山云镜像标签失败: {e}")
            raise ValueError(f"删除火山云镜像标签失败: {e}")

class PrivateHarborChecker:
    def __init__(self, harbor_url: str, username: str, password: str):
        self.harbor_url = harbor_url.rstrip("/")
        self.username = username
        self.password = password
        # 提取域名部分用于镜像前缀
        self.registry_host = harbor_url.split("://", 1)[-1]

    async def test_connectivity(self):
        await self._request("health")
        return True
    # ---------- 内部通用方法 ----------
    async def _request(self, path: str, params: Optional[dict] = None) -> Tuple[List[dict], int]:
        """统一发送 GET 请求并返回 JSON 列表"""
        try:
            params = params or {}
            url = f"{self.harbor_url}/api/v2.0/{path.lstrip('/')}"
            async with httpx.AsyncClient(
                auth=(self.username, self.password),
                verify=False,
                timeout=30,
            ) as cli:
                resp = await cli.get(url, params=params)
                resp.raise_for_status()          # 抛出 4xx/5xx
                total = int(resp.headers.get("X-Total-Count", "0"))
                return resp.json(),total
        except httpx.HTTPStatusError as e:
            # 捕获 HTTP 错误（带响应体）
            try:
                error_detail = e.response.json()
            except Exception:
                error_detail = e.response.text
            raise ValueError(
                f"Harbor API HTTP Error: {e.response.status_code} {e.response.reason_phrase}\n"
                f"URL: {e.request.url}\n"
                f"Response: {error_detail}"
            ) from e

        except httpx.RequestError as e:
            # 捕获请求层错误（连接超时、DNS 等）
            raise ValueError(
                f"Harbor API Request Error: {str(e)}\nURL: {e.request.url if e.request else 'N/A'}"
            ) from e

        except Exception as e:
            # 捕获其他未知错误（带堆栈）
            tb = traceback.format_exc()
            raise ValueError(f"Unexpected Error while connecting Harbor API: {e}\n{tb}") from e

    async def _delete_request(self, path: str) -> None:
        """统一发送 DELETE 请求"""
        try:
            url = f"{self.harbor_url}/api/v2.0/{path.lstrip('/')}"
            async with httpx.AsyncClient(
                auth=(self.username, self.password),
                verify=False,
                timeout=30,
            ) as cli:
                resp = await cli.delete(url)
                resp.raise_for_status()          # 抛出 4xx/5xx
        except httpx.HTTPStatusError as e:
            # 捕获 HTTP 错误（带响应体）
            try:
                error_detail = e.response.json()
            except Exception:
                error_detail = e.response.text
            raise ValueError(
                f"Harbor API HTTP Error: {e.response.status_code} {e.response.reason_phrase}\n"
                f"URL: {e.request.url}\n"
                f"Response: {error_detail}"
            ) from e

        except httpx.RequestError as e:
            # 捕获请求层错误（连接超时、DNS 等）
            raise ValueError(
                f"Harbor API Request Error: {str(e)}\nURL: {e.request.url if e.request else 'N/A'}"
            ) from e

        except Exception as e:
            # 捕获其他未知错误（带堆栈）
            tb = traceback.format_exc()
            raise ValueError(f"Unexpected Error while connecting Harbor API: {e}\n{tb}") from e

    # ---------- 业务接口 ----------
    async def get_projects(self, namespaces:str = None, page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """返回有镜像的 Harbor 项目名列表"""
        name = None
        if namespaces:
            name = namespaces
        projects, total = await self._request("projects", {"page": page, "page_size": page_size, "name": name})
        data = [p["name"] for p in projects]
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "data": data,
        }


    async def get_images(self, namespace:str, name:str = None, page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """返回 project 下所有镜像 <registry>/<proj>/<repo>:<tag> 列表"""
        params = {"page": page, "page_size": page_size}
        if name:
            params["q"] = f"name=~{name}"      # Harbor 模糊匹配语法
        repos, total = await self._request(f"projects/{namespace}/repositories", params)

        tasks = [
            self.get_tags(namespace, r["name"].split("/", 1)[1])
            for r in repos
        ]
        # 并发拉取所有 tag，避免顺序等待
        all_tags = await asyncio.gather(*tasks)

        images = []
        for repo, tags in zip(repos, all_tags):
            repo_short = repo["name"].split("/", 1)[1]
            tags = tags or []  # 确保可迭代
            for tag in tags:
                images.append(f"{repo_short}:{tag}")

        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "data": images,
        }


    async def get_tags(self, project: str, repo_name: str) -> List[str]:
        """获取单个仓库的所有 tag 名"""
        # 仓库名称带/的需要url编码2次
        encoded_repo = quote(quote(repo_name, safe=""), safe="")
        artifacts, total = await self._request(
            f"projects/{project}/repositories/{encoded_repo}/artifacts",
            {"page": 1, "page_size": 100},
        )
        tags = []
        for art in artifacts:
            for t in art.get("tags") or []:
                tags.append(t["name"])
        return tags

    async def check_tag_exists(self, project: str, repo_name: str, tag: str) -> bool:
        """检查指定的 tag 是否存在"""
        try:
            # 仓库名称带/的需要url编码2次
            encoded_repo = quote(quote(repo_name, safe=""), safe="")
            artifacts, _ = await self._request(
                f"projects/{project}/repositories/{encoded_repo}/artifacts",
                {"page": 1, "page_size": 100},
            )
            # 遍历所有 artifacts，检查是否有指定的 tag
            for art in artifacts:
                art_tags = art.get("tags", [])
                for t in art_tags:
                    if t.get("name") == tag:
                        return True
            return False
        except Exception as e:
            # 如果查询失败（可能是镜像不存在），返回 False
            logger.warning(f"查询Harbor镜像标签失败: {e}")
            return False

    async def delete_tags(self, namespace: str, repository: str, tags: List[str]) -> None:
        """删除 Harbor 镜像仓库的标签"""
        try:
            # 仓库名称带/的需要url编码2次
            encoded_repo = quote(quote(repository, safe=""), safe="")
            
            # 删除每个标签
            for tag in tags:
                # 先获取 artifact 的 digest
                # 使用 list_artifacts API 获取所有 artifacts，然后找到对应的 tag
                artifacts, _ = await self._request(
                    f"projects/{namespace}/repositories/{encoded_repo}/artifacts",
                    {"page": 1, "page_size": 100},
                )
                
                if not artifacts:
                    logger.warning(f"未找到仓库 {repository} 的 artifacts，跳过删除标签 {tag}")
                    continue
                
                # 查找包含指定 tag 的 artifact
                target_artifact = None
                for art in artifacts:
                    art_tags = art.get("tags", [])
                    for t in art_tags:
                        if t.get("name") == tag:
                            target_artifact = art
                            break
                    if target_artifact:
                        break
                
                if not target_artifact:
                    logger.warning(f"未找到标签 {tag} 对应的 artifact，跳过删除")
                    continue
                
                # 获取 artifact 的 digest
                digest = target_artifact.get("digest")
                if not digest:
                    logger.warning(f"未找到 artifact 的 digest，跳过删除标签 {tag}")
                    continue
                
                # 删除标签
                # digest 也需要 URL 编码
                encoded_digest = quote(digest, safe="")
                encoded_tag = quote(tag, safe="")
                delete_path = f"projects/{namespace}/repositories/{encoded_repo}/artifacts/{encoded_digest}/tags/{encoded_tag}"
                await self._delete_request(delete_path)
                logger.info(f"成功删除 Harbor 镜像标签: {namespace}/{repository}:{tag}")
        except httpx.HTTPStatusError as e:
            logger.error(f"删除 Harbor 镜像标签失败: {e}")
            raise ValueError(f"删除 Harbor 镜像标签失败: {e.response.status_code} {e.response.text}")
        except Exception as e:
            logger.error(f"删除 Harbor 镜像标签失败: {e}")
            raise ValueError(f"删除 Harbor 镜像标签失败: {e}")


# Usage example
# async def main():
    # huoshan
    # huoshan_checker = await RepositoryImageFactory.create_checker(
    #     RepositoryType.VOLCENGINE.value,
    #     # Usage
    #     url="lab-cn-guangzhou.cr.volces.com",
    #     access_key="<VOLCENGINE_ACCESS_KEY_ID>",
    #     secret_key="<VOLCENGINE_SECRET_KEY>",
    #     registry="lab",
    #     region="cn-guangzhou",
    #
    # )
    # print(f"huoshan namespaces: {await huoshan_checker.get_projects()}")
    # print(f"huoshan images: {await huoshan_checker.get_images(namespace='lab',name='deepexi')}")

    # private_harbor example
    # private_harbor_checker = await RepositoryImageFactory.create_checker(
    #     RepositoryType.PRIVATE_HARBOR.value,
    #     harbor_url = "https://118.145.68.44:8443",
    #     username="admin",
    #     password="<HARBOR_PASSWORD>"
    # )
    # print(f"private_harbor namespaces: {await private_harbor_checker.test_connectivity()}")
    # print(f"private_harbor namespaces: {await private_harbor_checker.get_projects(namespaces = 'l')}")
    # print(f"private_harbor images: {await private_harbor_checker.get_images(namespace='lab',name='deepexi')}")

# asyncio.run(main())

