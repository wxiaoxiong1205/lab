"""
Swagger/OpenAPI 配置模块

提供 Bearer Token 认证的 Swagger UI 配置
"""
import re
from typing import Dict, Any
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def setup_swagger_bearer_auth(app: FastAPI) -> None:
    """
    为 FastAPI 应用配置 Swagger UI 的 Bearer Token 认证
    
    注意：此配置与 app.utils.auth 中的 OAuth2PasswordBearer 兼容，
    确保 Swagger UI 能正确将 token 添加到 Authorization header 中。
    
    Args:
        app: FastAPI 应用实例
    """
    def custom_openapi() -> Dict[str, Any]:
        """
        自定义 OpenAPI schema，添加 Bearer Token 认证支持
        
        Returns:
            OpenAPI schema 字典
        """
        if app.openapi_schema:
            return app.openapi_schema
        
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description or "",
            routes=app.routes,
        )
        
        # 确保 components 存在
        if "components" not in openapi_schema:
            openapi_schema["components"] = {}
        
        # 重要：OAuth2PasswordBearer 会自动生成 OAuth2 风格的 security scheme
        # 我们需要移除所有 OAuth2 相关的配置，只保留 HTTP Bearer 方案
        if "securitySchemes" not in openapi_schema["components"]:
            openapi_schema["components"]["securitySchemes"] = {}
        
        # 移除所有 OAuth2 相关的 security scheme（OAuth2PasswordBearer 自动生成的）
        # 只保留 HTTP Bearer 方案
        oauth2_schemes_to_remove = []
        for scheme_name in openapi_schema["components"]["securitySchemes"].keys():
            scheme = openapi_schema["components"]["securitySchemes"][scheme_name]
            if isinstance(scheme, dict) and scheme.get("type") == "oauth2":
                oauth2_schemes_to_remove.append(scheme_name)
        
        for scheme_name in oauth2_schemes_to_remove:
            del openapi_schema["components"]["securitySchemes"][scheme_name]
        
        # 添加 Bearer Token 安全定义（覆盖任何现有的配置）
        openapi_schema["components"]["securitySchemes"]["Bearer"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "输入 JWT Token（直接输入 token，Swagger 会自动添加 'Bearer ' 前缀）"
        }
        
        # 替换所有路由中的 OAuth2 security 引用为 Bearer
        # OAuth2PasswordBearer 会在路由中自动添加 OAuth2 security 引用
        for path, path_item in openapi_schema.get("paths", {}).items():
            for method in path_item.keys():
                if method.lower() in ["get", "post", "put", "delete", "patch", "head", "options"]:
                    if "security" in path_item[method]:
                        # 将 OAuth2 security 引用替换为 Bearer
                        security_list = path_item[method]["security"]
                        new_security_list = []
                        for security_item in security_list:
                            if isinstance(security_item, dict):
                                # 检查是否有 OAuth2 的引用
                                has_oauth2 = any(
                                    key in oauth2_schemes_to_remove 
                                    for key in security_item.keys()
                                )
                                if has_oauth2:
                                    # 替换为 Bearer
                                    new_security_list.append({"Bearer": []})
                                else:
                                    # 保留其他 security 配置
                                    new_security_list.append(security_item)
                            else:
                                new_security_list.append(security_item)
                        path_item[method]["security"] = new_security_list
        
        # 更新全局 security 设置，移除 OAuth2 引用，只保留 Bearer
        if "security" in openapi_schema:
            global_security = openapi_schema["security"]
            new_global_security = []
            for security_item in global_security:
                if isinstance(security_item, dict):
                    has_oauth2 = any(
                        key in oauth2_schemes_to_remove 
                        for key in security_item.keys()
                    )
                    if has_oauth2:
                        new_global_security.append({"Bearer": []})
                    else:
                        new_global_security.append(security_item)
                else:
                    new_global_security.append(security_item)
            openapi_schema["security"] = new_global_security
        else:
            openapi_schema["security"] = [{"Bearer": []}]
        
        # 为所有路径添加安全要求（除了公开路径）
        from app.utils.auth_middleware import PUBLIC_PATHS
        
        for path, path_item in openapi_schema.get("paths", {}).items():
            # 检查是否为公开路径
            is_public = False
            for public_pattern in PUBLIC_PATHS:
                if re.match(public_pattern, path):
                    is_public = True
                    break
            
            # 如果不是公开路径，为所有方法添加安全要求
            if not is_public:
                for method in path_item.keys():
                    if method.lower() in ["get", "post", "put", "delete", "patch", "head", "options"]:
                        # 只有当路由没有显式声明 security 时才添加
                        # 这样可以避免覆盖路由中已有的 security 配置
                        if "security" not in path_item[method]:
                            path_item[method]["security"] = [{"Bearer": []}]
        
        app.openapi_schema = openapi_schema
        return app.openapi_schema
    
    # 覆盖默认的 openapi 方法
    app.openapi = custom_openapi

