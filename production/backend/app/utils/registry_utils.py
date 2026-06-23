#!/usr/bin/env python3
"""
Registry 认证工具
"""

import requests
import re
from app.core.logging import logger


def registry_auth(registry_url, username, password):
    """
    Registry 认证函数
    
    Args:
        registry_url (str): Registry URL
        username (str): 用户名
        password (str): 密码
    
    Returns:
        bool: 认证成功返回 True，失败返回 False
    """
    try:
        v2_url = f"{registry_url.rstrip('/')}/v2/"
        response = requests.get(v2_url, timeout=10,verify=False)
        
        if response.status_code == 200:
            return True
        
        if response.status_code != 401:
            return False
            
        auth_header = response.headers.get('WWW-Authenticate', '')
        
        if 'Basic' in auth_header:
            return _test_auth(v2_url, auth=(username, password))
        
        if 'Bearer' in auth_header:
            token = _get_bearer_token(auth_header, username, password)
            return _test_auth(v2_url, headers={'Authorization': f'Bearer {token}'}) if token else False
            
        return False
        
    except Exception as e:
        raise Exception(f"Registry authentication failed: {e}")


def _get_bearer_token(auth_header, username, password):
    """获取 Bearer Token"""
    try:
        realm = re.search(r'realm="([^"]*)"', auth_header)
        if not realm:
            return None
            
        params = {}
        for param in ['service', 'scope']:
            match = re.search(rf'{param}="([^"]*)"', auth_header)
            if match:
                params[param] = match.group(1)
        
        response = requests.get(
            realm.group(1),
            params=params,
            auth=(username, password),
            timeout=10,
            verify=False
        )
        
        if response.status_code == 200:
            data = response.json()
            return data.get('access_token') or data.get('token')
            
    except Exception as e:
        logger.error(f"Registry get bearer token failed: {e}")
    return None


def _test_auth(url, auth=None, headers=None):
    """测试认证"""
    try:
        response = requests.get(url, auth=auth, headers=headers, timeout=10,verify=False)
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Registry test auth failed: {e}")
        return False
