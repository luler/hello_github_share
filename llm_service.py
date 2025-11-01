"""
LLM 服务模块：使用 OpenAI API 生成仓库摘要
"""
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models import Config


def get_config_value(db: Session, key: str, default: str = "") -> str:
    """从数据库获取配置值"""
    config = db.query(Config).filter(Config.key == key).first()
    return config.value if config and config.value else default


async def fetch_repo_content_with_jina(github_url: str, jina_api_key: str) -> Optional[str]:
    """使用 Jina.ai Reader API 获取 GitHub 仓库内容"""
    headers = {
        "X-Return-Format": "markdown"
    }
    if jina_api_key:
        headers["Authorization"] = f"Bearer {jina_api_key}"

    try:
        # Jina Reader API
        jina_url = f"https://r.jina.ai/{github_url}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(jina_url, headers=headers)
            if response.status_code == 200:
                return response.text
            else:
                print(f"Jina API 错误: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        print(f"Jina API 请求失败: {e}")
        return None


async def generate_summary_with_llm(
        content: str,
        base_url: str,
        api_key: str,
        model: str,
        prompt: str
) -> Optional[str]:
    """使用 OpenAI API 生成摘要"""
    if not api_key or not content:
        return None

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        data = {
            "model": model,
            "messages": [
                {"role": "system", "content": "你是一个专业的技术文档分析助手。"},
                {"role": "user", "content": f"{prompt}\n\n项目内容：\n{content}"}
            ],
            "max_tokens": 500
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=data
            )

            if response.status_code == 200:
                result = response.json()
                summary = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if not summary:
                    print('LLM 返回内容为空：', result)
                return summary
            else:
                print(f"OpenAI API 错误: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        print(f"LLM API 请求失败: {e}")
        return None


async def generate_repo_summary(github_url: str, db: Session) -> dict:
    """
    生成仓库摘要的主函数
    返回: {"success": bool, "summary": str, "error": str}
    """
    # 获取配置
    jina_api_key = get_config_value(db, "jina_api_key")
    openai_base_url = get_config_value(db, "openai_base_url", "https://api.openai.com/v1")
    openai_api_key = get_config_value(db, "openai_api_key")
    openai_model = get_config_value(db, "openai_model", "gpt-4o-mini")
    openai_prompt = get_config_value(db, "openai_prompt", "请用中文总结这个GitHub项目的主要功能和特点，限制在200字以内。")

    # 检查必要配置
    if not openai_api_key:
        return {"success": False, "summary": "", "error": "未配置 OpenAI API Key"}

    # 1. 使用 Jina 获取仓库内容
    content = await fetch_repo_content_with_jina(github_url, jina_api_key)
    if not content:
        # 如果 Jina 失败，尝试直接使用 GitHub URL
        content = f"GitHub 仓库地址: {github_url}"

    # 2. 使用 LLM 生成摘要
    summary = await generate_summary_with_llm(
        content,
        openai_base_url,
        openai_api_key,
        openai_model,
        openai_prompt
    )

    if summary:
        return {"success": True, "summary": summary, "error": ""}
    else:
        return {"success": False, "summary": "", "error": "生成摘要失败"}
