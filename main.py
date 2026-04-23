import os
from typing import Annotated, TypedDict, List
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

load_dotenv()

# 1. Define State
class AgentState(TypedDict):
    query: str
    intent: str
    context: List[str]
    response: str
    needs_escalation: bool
    human_feedback: str

# 2. Initialize Components
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_db = Chroma(persist_directory="chroma_db", embedding_function=embeddings)
llm = ChatGroq(model="llama-3.3-70b-versatile")

# 3. Define Nodes
def router_node(state: AgentState):
    """Classifies the intent and decides if escalation is needed."""
    query = state["query"]
    
    prompt = ChatPromptTemplate.from_template(
        "Classify the intent of this customer query: '{query}'.\n"
        "Categories: [General, Escalation]\n"
        "If the query contains threats, legal mentions, or extreme frustration, classify as Escalation.\n"
        "Return ONLY the category name."
    )
    chain = prompt | llm
    intent = chain.invoke({"query": query}).content.strip()
    
    return {
        "intent": intent,
        "needs_escalation": intent == "Escalation"
    }

def retrieve_node(state: AgentState):
    """Retrieves relevant context from ChromaDB."""
    if state["needs_escalation"]:
        return {}
        
    query = state["query"]
    results = vector_db.similarity_search(query, k=3)
    context = [res.page_content + "\nSuggested Response: " + res.metadata['response'] for res in results]
    
    return {"context": context}

def generate_node(state: AgentState):
    """Generates a response using the retrieved context."""
    if state["needs_escalation"]:
        return {}

    query = state["query"]
    context = "\n---\n".join(state["context"])
    
    prompt = ChatPromptTemplate.from_template(
        "You are a helpful customer support agent. Answer the user's query using the context provided.\n"
        "If the context doesn't help, say you need to check with a supervisor.\n\n"
        "Context:\n{context}\n\n"
        "User Query: {query}\n\n"
        "Response:"
    )
    chain = prompt | llm
    response = chain.invoke({"query": query, "context": context}).content
    
    # Check if we should escalate based on the response content
    if "supervisor" in response.lower() or "not sure" in response.lower():
        return {"response": response, "needs_escalation": True}
        
    return {"response": response}

def human_review_node(state: AgentState):
    """This node is reached if escalation is needed. In a real app, it would wait for input."""
    print("\n--- [SYSTEM] HITL Escalation Triggered ---")
    if state.get("human_feedback"):
        return {"response": f"Approved by Supervisor: {state['human_feedback']}"}
    return {"response": "This query has been escalated to a human supervisor. Please wait."}

# 4. Define Graph Logic
def should_escalate(state: AgentState):
    if state["needs_escalation"]:
        return "escalate"
    return "generate"

workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("router", router_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)
workflow.add_node("human_review", human_review_node)

# Add Edges
workflow.set_entry_point("router")
workflow.add_edge("router", "retrieve")
workflow.add_edge("retrieve", "generate")

# Conditional Edge for HITL
workflow.add_conditional_edges(
    "generate",
    should_escalate,
    {
        "escalate": "human_review",
        "generate": END
    }
)

# If router says escalation, go straight to HITL
workflow.add_conditional_edges(
    "router",
    lambda x: "escalate" if x["needs_escalation"] else "retrieve",
    {
        "escalate": "human_review",
        "retrieve": "retrieve"
    }
)

workflow.add_edge("human_review", END)

# 5. Compile Graph
memory = MemorySaver()
app = workflow.compile(checkpointer=memory, interrupt_before=["human_review"])

# 6. Execution Helper
def query_bot(query: str, thread_id: str = "1"):
    config = {"configurable": {"thread_id": thread_id}}
    
    # Run the graph
    events = app.stream({"query": query}, config, stream_mode="values")
    
    final_state = None
    for event in events:
        final_state = event
        
    # Check if we are interrupted at human_review
    snapshot = app.get_state(config)
    if snapshot.next:
        print(f"\n[!] The query '{query}' requires human approval.")
        return "WAITING_FOR_HUMAN"
    
    return final_state["response"]

if __name__ == "__main__":
    print("=== Customer Support RAG Assistant (LangGraph + HITL) ===")
    print("Type 'exit' to quit.")
    
    while True:
        user_input = input("\nCustomer: ")
        if user_input.lower() in ["exit", "quit"]:
            break
            
        response = query_bot(user_input)
        
        if response == "WAITING_FOR_HUMAN":
            print("\n[SYSTEM] Query escalated. A human supervisor has been notified.")
        else:
            print(f"\nAI: {response}")
