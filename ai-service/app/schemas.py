from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """JSON camelCase (CONVENTIONS.md mục 3); bỏ qua trường thừa."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
