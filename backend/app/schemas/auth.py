from pydantic import BaseModel, EmailStr
from typing import Optional, List


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
    roles: str = "viewer"


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    roles: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
