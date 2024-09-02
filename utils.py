
import json

import requests

def save_to_file(file_path, data):
  with open(file_path, 'w', encoding="utf8") as file:
    json.dump(data, file, ensure_ascii=False, indent=4)

def file_exists(file_path):
  try:
    with open(file_path) as file:
      return True
  except FileNotFoundError:
    return False

def save_image(file_path, url):
  img_response = requests.get(url)

  with open(file_path, 'wb') as file:
    file.write(img_response.content)