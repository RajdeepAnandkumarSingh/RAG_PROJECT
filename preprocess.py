import pandas as pd
import os

def load_and_preprocess(file_path, sample_size=5000):
    """
    Loads and cleans the customer support dataset.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset not found at {file_path}")
        
    print(f"Loading {file_path}...")
    df = pd.read_csv(file_path)
    
    # Clean rows with missing critical info
    df = df.dropna(subset=['instruction', 'response', 'intent'])
    
    if sample_size and len(df) > sample_size:
        print(f"Sampling {sample_size} rows for efficiency.")
        df = df.sample(sample_size, random_state=42)
        
    # Standardize text for better embedding
    df['text_to_embed'] = df.apply(
        lambda x: f"Intent: {x['intent']}\nQuestion: {x['instruction']}\nCategory: {x['category']}", 
        axis=1
    )
    
    return df

if __name__ == "__main__":
    df = load_and_preprocess("Customer_Support_Training_Dataset.csv")
    print(f"Preprocessed {len(df)} rows.")
