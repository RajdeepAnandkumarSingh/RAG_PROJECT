import streamlit as st
import os
import asyncio
from main import app, AgentState
from config import settings

st.set_page_config(page_title="RAG Support Assistant", layout="wide")

# Custom CSS for Premium Look
st.markdown("""
    <style>
    .main {
        background-color: #0e1117;
    }
    .stTextInput > div > div > input {
        background-color: #1a1c24;
        color: white;
        border: 1px solid #3d444d;
    }
    .chat-bubble {
        padding: 15px;
        border-radius: 10px;
        margin-bottom: 10px;
    }
    .user-bubble {
        background-color: #2e3b4e;
        border-left: 5px solid #007bff;
    }
    .ai-bubble {
        background-color: #1a1c24;
        border-left: 5px solid #28a745;
    }
    .hitl-warning {
        background-color: #4a2b2b;
        border: 1px solid #ff4b4b;
        padding: 10px;
        border-radius: 5px;
        color: #ff4b4b;
        font-weight: bold;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("🛡️ RAG Support Assistant")
st.caption(f"LangGraph + ChromaDB + Groq ({settings.GROQ_MODEL_ROUTER} / {settings.GROQ_MODEL_GENERATOR})")

if "messages" not in st.session_state:
    st.session_state.messages = []

# Sidebar for Context Visualization
with st.sidebar:
    st.header("🔍 Retrieval Inspector")
    st.info("This panel shows the context fetched from your CSV dataset.")
    retrieved_placeholder = st.empty()

# Chat Interface
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

async def execute_graph(user_prompt: str, config: dict):
    final_state = None
    async for event in app.astream(
        {"query": user_prompt, "user_query": user_prompt},
        config,
        stream_mode="values"
    ):
        final_state = event
    return final_state

if prompt := st.chat_input("Ask a customer support question..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Thinking and retrieving..."):
            config = {"configurable": {"thread_id": "streamlit_user"}}
            
            # Execute the async graph logic
            final_state = asyncio.run(execute_graph(prompt, config))
            
            # Check for HITL
            snapshot = app.get_state(config)
            if snapshot.next:
                st.markdown('<div class="hitl-warning">⚠️ HUMAN INTERVENTION REQUIRED: This query has been escalated due to its sensitivity or complexity.</div>', unsafe_allow_html=True)
                response = "System: This query requires supervisor approval. A human agent has been alerted."
            else:
                response = final_state.get("response", "I'm sorry, I couldn't process that.")
                
                # Show context in sidebar
                if final_state.get("context"):
                    with retrieved_placeholder.container():
                        for i, ctx in enumerate(final_state["context"]):
                            st.text_area(f"Chunk {i+1}", ctx, height=150)

            st.markdown(response)
            st.session_state.messages.append({"role": "assistant", "content": response})
