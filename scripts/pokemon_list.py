
from bs4 import BeautifulSoup
import requests

from pokemon import get_pokemon_data
from fixed_data import NEW_NAMES
from utils import file_exists, save_to_file

PATH = './../data'

def get_pokemon_list():
  url = 'https://wiki.52poke.com/wiki/宝可梦列表（按全国图鉴编号）/简单版'
  response = requests.get(url)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  table = soup.find('table', class_='eplist')
  tr_list = table.find_all('tr')
  pokemon_simple_list = []

  for tr in tr_list:
    td_list = tr.find_all('td')
    if len(td_list) == 4:
      index_no = td_list[0].text.strip().replace('#', '')
      name = td_list[1].find('a').text.strip()
      name_en = td_list[3].find('a').text.strip()
      pokemon_simple_list.append({
        'index': index_no,
        'name': NEW_NAMES[name] if NEW_NAMES[name] else name,
        'name_en': name_en
      })
  save_to_file(f'{PATH}/pokemon_list.json', pokemon_simple_list)
  return pokemon_simple_list

if __name__ == '__main__':
  pokemon_list = get_pokemon_list()
  for pokemon in pokemon_list:
    index = pokemon['index']
    name = pokemon['name']
    file_name = f'{PATH}/pokemon/{index}-{name}.json'
    if file_exists(file_name):
      print(f'{name} 已存在, 跳过...')
      continue

    print(f'正在获取 {name}...')
    data = get_pokemon_data(name, index)
    save_to_file(file_name, data)
