from datetime import time, datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, ConfigDict, Field, Json

from app.schemas.business_attr_value import BusinessAttrValueInput, BusinessAttrValueResponse, BusinessAttrValueUpdateInput


class ThirdPartyApiCreate(BaseModel):
    id :Optional[int] = Field(None ,description="API 主键id")
    name : Optional[str] = Field(description="API名称",min_length=1)
    description : Optional[str] = Field(None ,description="API描述", max_length=1000 )
    base_url : Optional[str] = Field(description="API url",min_length=1)
    header : List[Dict[str, Any]] = Field(description="HTTP Header")
    request_param :  List[Dict[str, Any]] = Field(description="请求参数")
    response_param : List[Dict[str, Any]] = Field(description="响应参数")
    request_type : Optional[str] = Field("POST",description="API请求方式")
    protocol : Optional[str] = Field("application/json",description="API协议")
    attr_values: Optional[List[BusinessAttrValueInput]] = Field(None, description="关联属性值及属性值选项")


class ThirdPartyApiDeleteRequest(BaseModel):
    ids:Optional[List[int]] = Field(description="API主键id",min_length=1)

class ThirdPartyApiUpdateRequest(BaseModel):
    id:Optional[int] = Field(description="API主键id" )
    name : Optional[str] = Field(description="API名称",min_length=1)
    description : Optional[str] = Field(description="API描述", max_length=1000 )
    base_url : Optional[str] = Field(description="API url",min_length=1)
    header : Optional[List[Dict[str, Any]]] = Field(description="HTTP Header")
    request_param : Optional[List[Dict[str, Any]]] = Field(description="请求参数")
    response_param : Optional[List[Dict[str, Any]]] = Field(description="响应参数")
    request_type : Optional[str] = Field("POST",description="API请求方式")
    protocol : Optional[str] = Field("application/json",description="API协议")
    status: Optional[str] = Field(None,description="测试链接状态")
    attr_values: Optional[List[BusinessAttrValueUpdateInput]] = Field(None, description="关联属性值及选项（传入则更新）")




class ThirdPartyApiListResponse(BaseModel):
    id:Optional[int] = Field(description="API主键id" )
    name : Optional[str] = Field(description="API名称" )
    description : Optional[str] = Field(description="API描述", max_length=1000 )
    base_url : Optional[str] = Field(description="API url" )
    request_type : Optional[str] = Field("POST",description="API请求方式")
    protocol : Optional[str] = Field("application/json",description="API协议")
    status:  Optional[str] = Field(description="测试链接状态" )
    created_by : Optional[str] = Field(description="创建人" )
    created_at: Optional[datetime] = Field(None,description="创建时间" )

class ThirdPartyApiDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = Field(description="API主键id" )
    name: Optional[str] = Field(description="API名称" )
    description: Optional[str] = Field(None, description="API描述", max_length=1000 )
    base_url: Optional[str] = Field(description="API url" )
    header: Optional[List[Dict[str, Any]]] = Field(description="请求头" )
    request_param: Optional[List[Dict[str, Any]]] = Field(description="请求参数" )
    response_param: Optional[List[Dict[str, Any]]] = Field(description="响应参数" )
    request_type : Optional[str] = Field("POST",description="API请求方式")
    protocol : Optional[str] = Field("application/json",description="API协议")
    status: Optional[str] = Field(description="测试链接状态" )
    created_by: Optional[str] = Field(description="创建人" )
    created_at: Optional[datetime] = Field(None,description="创建时间" )
    attr_values: List[BusinessAttrValueResponse] = Field(default_factory=list, description="关联属性值及选项")





class ThirdPartyApiVerifyConnectRequest(BaseModel):
    id :Optional[int] = Field(description="API 主键id")
    verify_request_param :  Dict[str, Any]  = Field(None,description="请求参数")




class ThirdPartyApiVerifyConnectResponse(BaseModel):
    state : Optional[int] = Field(None,description="连接状态")
    original_data :Optional[Any] = Field(None,description="接口原始响应")
    mapped_response_data :  Optional[Any] = Field(None,description="接口映射响应")
    mapped_request_data :  Optional[Any] = Field(None,description="接口映射参数")



class ThirdPartyApiBindingFileds(BaseModel):
    request_binding :  Optional[List[Dict[str, Any]]] = Field(None,description="接口请求可选映射字段")
    response_binding :  Optional[List[Dict[str, Any]]] = Field(None,description="接口响应可选映射参数")
