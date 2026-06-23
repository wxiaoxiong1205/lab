from typing import Optional, List

from pydantic import Field, conint


class UserBatchQuery:
    # 用户名
    nickname: Optional[str] = Field(None, description="用户名")

    # 用户状态（0-2之间的整数）
    status: Optional[conint(ge=0, le=2)] = Field(
        None,
        description="用户状态",
        json_schema_extra={"message": "IAM_USER_STATUS_ILLEGAL"}
    )

    # 帐号名
    username: Optional[str] = Field(None, description="帐号名")

    # 姓名
    name: Optional[str] = Field(None, description="姓名")

    # 租户ID
    tenantId: Optional[str] = Field(None, description="tenantId")  # 注意Python变量名规范（蛇形命名）

    # 属性对应的主键id
    attributeId: Optional[int] = Field(None, description="属性对于的主键id")

    # 属性name
    attributeName: Optional[str] = Field(None, description="属性name")

    # 属性值（字符串列表）
    value: Optional[List[str]] = Field(None, description="属性值")

    # 用户属性和值列表（假设UserAttrAndValue是另一个模型类）
    userAttrAndValueList: Optional[List["UserAttrAndValue"]] = Field(  # 注意蛇形命名
        None,
        description=""  # 原Java字段未标注ApiModelProperty，保持空描述
    )

    # 用户id（英文逗号分隔字符串）
    userIds: Optional[str] = Field(None, description="用户id, 英文逗号分隔")

    # 组织id（英文逗号分隔字符串）
    orgIds: Optional[str] = Field(None, description="组织id, 英文逗号分隔")

    # 控制台的角色id（英文逗号分隔字符串）
    roleIds: Optional[str] = Field(None, description="控制台的角色id, 英文逗号分隔")

    # 页码（最小为1，默认1）
    pageNum: conint(ge=1) = Field(  # ge=1 对应 @Min(value=1)
        1,
        description="页码",
        json_schema_extra={"message": "PAGE_NUM_ILLEGAL"}
    )

    # 页大小（最小为1，默认10）
    pageSize: conint(ge=1) = Field(  # ge=1 对应 @Min(value=1)
        10,
        description="页大小",
        json_schema_extra={"message": "PAGE_SIZE_ILLEGAL"}
    )


class IAMAccountQuery:
    tenantId: Optional[str] = Field(None, description="tenantId")
    # 应用id
    appId: Optional[int] = None

    # 帐号名
    name: Optional[str] = None

    # 帐号名集合
    usernames: Optional[List[str]] = None

    # 邮箱
    email: Optional[str] = None

    # 手机号
    phone: Optional[str] = None

    # 帐号状态[0-启用,1-禁用]
    status: Optional[int] = None

    # 姓名
    nickname: Optional[str] = None

    # 姓名集合
    nicknames: Optional[List[str]] = None

    # 是否主账号
    isMain: Optional[bool] = None

    # 关键字（账号名/用户名/手机号）
    keyword: Optional[str] = None

    # 群组ID
    groupId: Optional[int] = None

    # 是否查询群组数量
    groupCount: Optional[bool] = None

    # 用户ID集合
    userIds: Optional[str] = None

    # 手机号模糊查询
    fuzzyPhone: Optional[str] = None

    # 扩展字段1
    extend1: Optional[int] = None

    # 扩展字段2
    extend2: Optional[str] = None

    # 扩展字段3
    extend3: Optional[str] = None

    # 扩展字段4
    extend4: Optional[str] = None

    # 群组ID集合
    groupIds: Optional[List[int]] = None

    # 模糊匹配用户名或账号
    nickNameOrUserNameKeyword: Optional[str] = None

    # 额外查询的userId，作为补充查询的手段，方便前端处理
    extraUserId: Optional[int] = None

    # accountIds集合
    accountIds: Optional[str] = None

    # 当前页，非必填(默认1)，约束：不能小于0（对应@Min(value = -1)，实际业务中取>=0）
    page: conint(ge=0) = Field(
        default=1,
        description="当前页，非必填(默认1)，最小值0"
    )

    # 页码大小，非必填(默认10)，约束：不能小于1（对应@Min(value = 1)）
    size: conint(ge=1) = Field(
        default=10,
        description="页码大小，非必填(默认10)，最小值1"
    )
