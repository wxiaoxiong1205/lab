# app/utils/scanner.py
import importlib
import inspect
import logging
import os
import pkgutil
import re
from abc import ABC
from typing import Type, Set

from dependency_injector import containers, providers

from app.core.config import Settings
from app.database.base import get_db
from app.database.database_depends import Database
from app.repository.base_mapper import BaseMapper

logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_module_file_names(module_name: str) -> list:
    """
    获取指定模块所在目录下的文件名（.py 文件去除后缀，其他文件保留原名）

    Args:
        module_name: 模块名（如 "app.api.routes"）

    Returns:
        处理后的文件名列表
    """
    try:
        # 1. 导入模块并获取路径
        module = importlib.import_module(module_name)
        module_path = module.__file__
        if not module_path:
            return []

        # 2. 获取模块所在目录
        module_dir = os.path.dirname(module_path)

        # 3. 列出目录下所有文件，处理 .py 后缀
        file_names = []
        for f in os.listdir(module_dir):
            # 若为 .py 文件，去除后缀；否则保留原名
            if f.endswith(".py"):
                f_ = os.path.splitext(f)[0]
                if not f_.startswith("_DISABLED"):
                    file_names.append(module_name + "." + os.path.splitext(f)[0])  # 用 splitext 分割文件名和后缀
            else:
                file_names.append(f)

        return file_names

    except ImportError:
        print(f"模块 {module_name} 不存在")
        return []
    except Exception as e:
        print(f"获取文件列表失败：{e}")
        return []


def scan_package(package_name: str) -> Set[Type[ABC]]:
    """
    扫描指定 package 下所有继承自 BaseService 的类
    :param package_name: package 路径（如 "app.services"）
    :return: 符合条件的类列表
    """
    service_classes: Set[Type[ABC]] = set()
    package = importlib.import_module(package_name)
    package_path = os.path.dirname(package.__file__)

    # 递归遍历 package 下的所有模块
    for _, module_name, is_pkg in pkgutil.walk_packages(
            path=[package_path],
            prefix=f"{package_name}."
    ):
        if is_pkg or module_name.endswith("interface"):
            continue  # 跳过子 package，仅处理模块

        # 导入模块
        module = importlib.import_module(module_name)

        # 遍历模块中的所有类，筛选继承 BaseService 的类
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            # 检查是否为类、是否继承 BaseService、且不是 BaseService 本身
            if (
                    isinstance(attr, type)
                    and issubclass(attr, ABC)
                    and attr != ABC
                    and not str(attr).__contains__("interface")
                    and (attr_name.endswith("Service") or attr_name.endswith("Mapper"))
            ):
                service_classes.add(attr)

    return service_classes


def scan_interface_package(package_name: str) -> Set[Type[ABC]]:
    """
    扫描指定 package 下所有继承自 接口类 的类 防止注入多实现
    :param package_name: package 路径（如 "app.services"）
    :return: 符合条件的类列表
    """
    service_classes: Set[Type[ABC]] = set()
    package = importlib.import_module(package_name)
    package_path = os.path.dirname(package.__file__)

    # 递归遍历 package 下的所有模块
    for _, module_name, is_pkg in pkgutil.walk_packages(
            path=[package_path],
            prefix=f"{package_name}."
    ):

        # 导入模块
        module = importlib.import_module(module_name)

        # 遍历模块中的所有类，筛选继承 BaseService 的类
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            # 检查是否为类、是否继承 BaseService、且不是 BaseService 本身
            if (
                    isinstance(attr, type)
                    and issubclass(attr, ABC)
                    and attr != ABC
                    and str(attr).__contains__("interface")
                    and (attr_name.endswith("Service"))
            ):
                service_classes.add(attr)

    return service_classes


# def create_auto_injector(package_names: array) -> Injector:
#     # """
#     # 创建 injector 容器，并自动注册 package 中符合条件的类
#     # :param package_names: 需要扫描的 package 路径
#     # :return: 配置好的 injector 实例
#     # """
#     # injector = Injector()
#     #
#     # all_service_classes: Set[Type[ABC]] = set()
#     # for package_name in package_names:
#     #     # 1. 扫描 package 下所有继承 BaseService 的类/ mapper类也扫描一下
#     #     service_classes = scan_package(package_name)
#     #     for service_class in service_classes:
#     #         all_service_classes.add(service_class)
#     #
#     # # 2. 自动注册到 injector（默认单例模式）
#     # for cls in all_service_classes:
#     #     # 绑定类到自身，作用域为单例（可根据需要修改为原型模式）
#     #     injector.binder.bind(cls.__base__, to=cls, scope=singleton)
#     #     print(f"自动注册服务: {cls.__name__}")
#     #
#     # @provider
#     # def provide_project_mapper(db: AsyncSession) -> ProjectMapper:
#     #     return ProjectMapper(session=db)  # 手动传递 session 参数
#     #     # 将提供者绑定到 ProjectMapper 类型
#     # injector.binder.bind(ProjectMapper, to=provide_project_mapper, scope=singleton)
#
#     # return injector
#     pass


def get_simple_service(all_services: Set[Type[ABC]]) -> (Set[Type[ABC]], Set[Type[ABC]]):
    simple_services: Set[Type[ABC]] = set()
    no_simple_services: Set[Type[ABC]] = set()
    for service_cls in all_services:
        # 使用 default_svc（捕获的当前 service_cls），而非外部的 service_cls
        count = get_init_param_count(service_cls)
        if count > 0:
            no_simple_services.add(service_cls)
        else:
            simple_services.add(service_cls)
    return simple_services, no_simple_services


def get_init_param_count(cls) -> int:
    """
    获取类构造函数（__init__）的参数个数（排除 self）

    Args:
        cls: 要检查的类

    Returns:
        排除 self 后的参数个数
    """
    # 获取类的 __init__ 方法（若未定义，返回 object.__init__）
    init_method = cls.__init__

    # 解析方法签名
    sig = inspect.signature(init_method)
    parameters = list(sig.parameters.values())

    # 排除第一个参数（通常是 self），统计剩余参数个数
    # 注意：若 __init__ 是静态方法或类方法，可能没有 self，但这种情况极少
    if parameters and parameters[0].name in ("self", "cls"):
        return len(parameters) - 1
    else:
        # 特殊情况：__init__ 没有 self/cls（如静态方法），返回所有参数个数
        return len(parameters)


# 为了方便使用一般都是直接注入的抽象class，这个要获取到最上层的抽象class，ABC的下一层
def get_service_name(service_clas: Type[ABC]) -> str:
    # mapper的不处理
    if service_clas.__name__.__contains__("Mapper"):
        return re.sub(r'^([A-Z])|(?<=[a-z])(?=[A-Z])', lambda m: f'_{m.group(0)}' if m.group(1) else '_',
                      service_clas.__name__).lstrip('_').lower()
    parents_except_object = [cls for cls in inspect.getmro(service_clas) if cls not in (service_clas, object)]
    if len(parents_except_object) < 2:
        return re.sub(r'^([A-Z])|(?<=[a-z])(?=[A-Z])', lambda m: f'_{m.group(0)}' if m.group(1) else '_',
                      service_clas.__name__).lstrip('_').lower()
    for i, cls in enumerate(parents_except_object):
        if cls == ABC:
            # 先找到ABC
            index = i
    cls_ = parents_except_object[index - 1]

    # 判断父类是否有抽象方法
    name = cls_.__name__
    # 根据class的驼峰改为下划线
    return re.sub(r'^([A-Z])|(?<=[a-z])(?=[A-Z])', lambda m: f'_{m.group(0)}' if m.group(1) else '_',
                  name).lstrip('_').lower()


def get_subclasses(cls, service_classes: Set[Type[ABC]]):
    subclasses = []
    for subclass in service_classes:
        # 判断：是子类，且不是自身
        if (issubclass(subclass, cls)
                and subclass != cls):
            subclasses.append(subclass)

    # 根据环境配置选择合适的class注入

    for subclass in subclasses:
        if str(subclass.__name__).lower().startswith(Settings.PROVIDER_TYPE):
            return subclass

    # 代表环境配置的class不存在，此时要回退到default 实现类
    for subclass in subclasses:
        if str(subclass.__name__).lower().startswith("default"):
            return subclass


def get_service_deps(
        service_cls,  # 捕获当前循环的 service_cls
        default_mappers,  # 捕获当前的 mapper_classes
        default_svcs,  # 捕获当前的 service_classes
        function_locals
):
    dependencies = {}
    # 使用 default_svc（捕获的当前 service_cls），而非外部的 service_cls
    if service_cls.__init__ is not object.__init__:
        try:
            for param_name, param_type in service_cls.__init__.__annotations__.items():
                if param_name == "return":
                    continue
                # 情况1：依赖是 Mapper（用 default_mappers 而非外部 mapper_classes）
                # 检查 default_mappers 中的类是否是 param_type 的子类
                # 特殊处理：如果 param_type 是 BaseMapper，直接使用通用的 mapper
                if param_type.__name__ == "BaseMapper":
                    # BaseMapper 使用通用的 mapper provider
                    dependencies[param_name] = function_locals.get("mapper")
                elif any(issubclass(m_cls, param_type) for m_cls in default_mappers):
                    dependencies[param_name] = function_locals.get(
                        get_service_name(param_type))  # 从已绑定的 Mapper 中获取
                # 情况2：依赖是其他 Service（用 default_svcs 而非外部 service_classes）
                elif any(issubclass(s_cls, param_type) for s_cls in default_svcs):
                    svc_bean = function_locals.get(get_service_name(param_type))
                    if svc_bean is not None:
                        # 从已绑定的 Service 中获取
                        dependencies[param_name] = function_locals.get(get_service_name(param_type))
                else:
                    # 当出现依赖的bean还没注入，要先注入进来，
                    # 这里需要注入实现类
                    if ABC in param_type.__bases__:
                        subclasses = get_subclasses(param_type, function_locals.get("all_impl_class"))
                        function_locals[get_service_name(param_type)] = providers.Singleton(subclasses, )
                        # 接口无 __init__ 参数，必须用实现类的依赖（如 DefaultInferenceServiceService 的 mapper）
                        deps = get_service_deps(subclasses, default_mappers, default_svcs, function_locals)
                    else:
                        function_locals[get_service_name(param_type)] = providers.Singleton(param_type, )
                        deps = get_service_deps(param_type, default_mappers, default_svcs, function_locals)
                    for dep_key, dep_val in deps.items():
                        service_name = get_service_name(param_type)
                        # 如果依赖是mapper类型，使用dep_val（已经是从function_locals获取的正确mapper）
                        # 不再使用通用的base_mapper，而是使用正确的mapper类型
                        function_locals[service_name].add_args(dep_val)
                    dependencies[param_name] = function_locals[get_service_name(param_type)]
        except AttributeError:
            print(f"Warning: Service {service_cls.__name__} 无 __annotations__，不注入依赖, e", AttributeError)
    else:
        print(f"Warning: Service {service_cls.__name__} 无显式 __init__，直接注入依赖")
    return dependencies


class AutoContainer(containers.DeclarativeContainer):
    # 获取api文件下的文件名
    names = get_module_file_names("app.api.v1") + get_module_file_names("app.api.openapi.v1")

    # 这里不支持整包扫描，只能具体到py文件
    wiring_config = containers.WiringConfiguration(modules=names)

    db = providers.Singleton(Database)
    logger.info("注入db")
    mapper = providers.Factory(BaseMapper, db=db)
    logger.info("注入BaseMapper")

    locals = locals()
    # 1. 基础依赖：异步数据库会话（供 mapper 依赖）
    db_session = providers.Factory(get_db)

    # 2. 自动扫描并注册所有 Mapper（类名以 Mapper 结尾）
    mapper_classes = scan_package("app.repository")
    for mapper_cls in mapper_classes:
        # 为每个 Mapper 注册 Factory，自动注入 db_session（假设 Mapper 构造函数有 session 参数）
        locals[get_service_name(mapper_cls)] = providers.Singleton(
            mapper_cls,
            db=db
        )
        logger.info(f"注入Mapper, {mapper_cls}")

    # 3. 自动扫描并注册所有 Service（类名以 Service 结尾）
    # 3.1先找到接口类
    interface_service_classes = scan_interface_package("app.services")
    # 这里的实现类包含多实现的，需要过滤才能使用
    locals["all_impl_class"] = scan_package("app.services")
    service_classes: Set[Type[ABC]] = set()
    # 3.2 找到合适的实现类
    for interface_service_class in interface_service_classes:
        subclasses = get_subclasses(interface_service_class, locals.get("all_impl_class"))
        if subclasses is not None:
            service_classes.add(subclasses)
        else:
            logger.warning(
                "发现没有实现子类的class。需要注意,interface_service_class = {} 可能存在循环依赖的问题，需要各自负责人检查逻辑",
                interface_service_class)
    # 4. 自动绑定 Service（处理无注解、跨Service依赖场景）
    simple_services: Set[Type[ABC]]
    no_simple_services: Set[Type[ABC]]
    simple_services, no_simple_services = get_simple_service(service_classes)
    # 4.1 获取构造函数简单的service先注入
    for simple_service in simple_services:
        locals[get_service_name(simple_service)] = providers.Singleton(simple_service, )
        logger.info(f"注入简单svc, {simple_service}")
    # 4.2 多个参数的service构造
    for service_cls in no_simple_services:
        service_name = get_service_name(service_cls)

        # 关键：通过参数 default_svc=service_cls、default_mappers=mapper_classes 捕获当前变量

        # 绑定 Service：调用函数获取依赖（函数已捕获当前 service_cls）
        logger.info(f"开始注入svc, {service_cls}, name = {service_name}")
        deps = get_service_deps(service_cls, mapper_classes, simple_services, locals)
        locals[service_name] = providers.Singleton(
            service_cls,
        )
        logger.info(f"注入完成svc, clas = {service_cls}, deps = {deps}")
        for dep_key, dep_val in deps.items():
            # 使用正确的依赖值，而不是通用的 mapper
            # dep_val 已经是从 function_locals 中获取的正确 mapper 或 service
            locals[service_name].add_args(dep_val)

# class AutoContainer(containers.DeclarativeContainer):
#     wiring_config = containers.WiringConfiguration(
#         modules=
#         [
#             "app.api.v1.project",
#             "app.api.v1.user"
#         ])
#
#     db = providers.Singleton(Database)
#     mapper = providers.Singleton(BaseMapper, db=db)
#
#     # DefaultUserService
#     user_service = providers.Singleton(DefaultUserService)
#     # DefaultProjectService
#     project_service = providers.Singleton(DefaultProjectService, ).add_args(user_service).add_args(mapper)
