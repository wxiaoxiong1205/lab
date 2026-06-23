"""
Utility functions for working with LangChain templates.
"""

from typing import Dict, List, Any, Optional, Union
import json
from pydantic import BaseModel

class PromptTemplateConverter:
    """
    Utility class for converting between our prompt format and LangChain's ChatPromptTemplate.
    """
    
    @staticmethod
    def to_langchain_format(
        messages: List[Dict[str, Any]], 
        input_variables: List[str],
        template_format: str = "f-string"
    ) -> Dict[str, Any]:
        """
        Convert our prompt format to a dictionary that can be used to create a LangChain ChatPromptTemplate.
        
        Args:
            messages: List of message templates
            input_variables: List of variable names
            template_format: The format of the template
            
        Returns:
            A dictionary with LangChain-compatible structure
        """
        formatted_messages = []
        
        for message in messages:
            if "role" in message and "content" in message:
                formatted_messages.append((
                    message["role"],
                    message["content"]
                ))
        
        return {
            "messages": formatted_messages,
            "input_variables": input_variables
        }
    
    @staticmethod
    def from_langchain_format(langchain_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a LangChain ChatPromptTemplate dictionary to our prompt format.
        
        Args:
            langchain_dict: A dictionary with LangChain ChatPromptTemplate structure
            
        Returns:
            A dictionary with our prompt format
        """
        messages = []
        
        # Handle different formats of LangChain messages
        lc_messages = langchain_dict.get("messages", [])
        
        for message in lc_messages:
            # Handle tuple format (role, content)
            if isinstance(message, tuple) and len(message) == 2:
                messages.append({
                    "role": message[0],
                    "content": message[1]
                })
            # Handle dictionary format
            elif isinstance(message, dict) and "role" in message and "content" in message:
                messages.append({
                    "role": message["role"],
                    "content": message["content"]
                })
            # Handle other formats (best effort)
            elif hasattr(message, "type") and hasattr(message, "content"):
                messages.append({
                    "role": getattr(message, "type"),
                    "content": getattr(message, "content")
                })
        
        return {
            "messages": messages,
            "input_variables": langchain_dict.get("input_variables", []),
            "template_format": langchain_dict.get("template_format", "f-string")
        }
    
    @staticmethod
    def create_langchain_template_code(
        messages: List[Dict[str, Any]], 
        input_variables: List[str]
    ) -> str:
        """
        Generate Python code to create a LangChain ChatPromptTemplate from our prompt format.
        
        Args:
            messages: List of message templates
            input_variables: List of variable names
            
        Returns:
            Python code as a string
        """
        messages_str = "[\n"
        for message in messages:
            if "role" in message and "content" in message:
                # Use triple quotes to avoid escaping issues
                content = message["content"].replace('\\', '\\\\').replace('"', '\\"')
                messages_str += f'    (\n        "{message["role"]}",\n        "{content}"\n    ),\n'
        messages_str += "]"
        
        input_vars_str = json.dumps(input_variables)
        
        code = f"""from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages(
    {messages_str}
)

# Input variables: {input_vars_str}
"""
        return code
        
    @staticmethod
    def create_chat_template(
        name: str,
        system_message: str = None,
        user_message: str = None,
        input_variables: List[str] = None,
        template_format: str = "f-string"
    ) -> Dict[str, Any]:
        """
        Create a new ChatPromptTemplate configuration with system and user messages.
        
        Args:
            name: Name of the template
            system_message: System message content
            user_message: User message content
            input_variables: List of variable names
            template_format: Format of the template strings
            
        Returns:
            A dictionary with the ChatPromptTemplate configuration
        """
        if input_variables is None:
            input_variables = []
            
        messages = []
        
        if system_message:
            messages.append({
                "role": "system",
                "content": system_message
            })
            
        if user_message:
            messages.append({
                "role": "user",
                "content": user_message
            })
            
        return {
            "name": name,
            "messages": messages,
            "input_variables": input_variables,
            "template_format": template_format
        }
        
    @staticmethod
    def validate_chat_template(
        chat_template: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate a ChatPromptTemplate configuration.
        
        Args:
            chat_template: A ChatPromptTemplate configuration
            
        Returns:
            A dictionary with validation results
        """
        if not chat_template.get("name"):
            return {"valid": False, "error": "Template name is required"}
            
        messages = chat_template.get("messages", [])
        input_variables = chat_template.get("input_variables", [])
        template_format = chat_template.get("template_format", "f-string")
        
        if not messages:
            return {"valid": False, "error": "At least one message is required"}
            
        # Extract all variables used in message templates
        used_variables = set()
        for message in messages:
            if "content" in message and isinstance(message["content"], str):
                used_variables.update(
                    PromptTemplateConverter._extract_variables_from_template(
                        message["content"], 
                        template_format
                    )
                )
        
        # Check if all input variables are used
        unused_variables = set(input_variables) - used_variables
        
        # Check if all used variables are defined
        undefined_variables = used_variables - set(input_variables)
        
        return {
            "valid": len(unused_variables) == 0 and len(undefined_variables) == 0,
            "unused_variables": list(unused_variables),
            "undefined_variables": list(undefined_variables)
        }
        
    @staticmethod
    def _extract_variables_from_template(template: str, template_format: str = "f-string") -> set:
        """
        Extract variable names from a template string.
        
        Args:
            template: The template string
            template_format: The format of the template ('f-string' or 'jinja2')
            
        Returns:
            A set of variable names found in the template
        """
        import re
        
        if template_format == "f-string":
            # Match patterns like {variable_name} in f-strings
            return set(re.findall(r'\{([^{}]+)\}', template))
        elif template_format == "jinja2":
            # Match patterns like {{ variable_name }} in Jinja2 templates
            return set(re.findall(r'\{\{\s*([^{}]+?)\s*\}\}', template))
        else:
            return set() 