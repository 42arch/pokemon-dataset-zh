
import json

def save_to_file(file_path, data):
  with open(file_path, 'w', encoding="utf8") as file:
    json.dump(data, file, ensure_ascii=False, indent=4)