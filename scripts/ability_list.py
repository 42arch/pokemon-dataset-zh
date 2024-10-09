# -*- coding: utf-8 -*-

from bs4 import BeautifulSoup
import requests

from ability import get_ability
from utils import file_exists, save_to_file

PATH = './../data'

def get_ability_list():
  headers = {
    'Accept-Language': 'zh-Hans'
  }
  url = 'https://wiki.52poke.com/wiki/特性列表'
  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  abilities = []
  ability_tables = soup.find_all('table', class_='eplist')

  for table in ability_tables:
    generation = table.find_previous('h2').text.strip().replace("引入特性", "")
    tr_list = table.find('tbody').find_all('tr')

    for idx, tr in enumerate(tr_list):
      if idx > 0:
        tds = tr.find_all('td')
        ability = {
          'index': tds[0].text.strip().replace("*", ""),
          'generation': generation,
          'name': tds[1].find('a').text.strip(),
          'name_jp': tds[2].text.strip(),
          'name_en': tds[3].text.strip(),
          'text': tds[4].text.strip(),
          'common_count': int(tds[5].text.strip() or 0),
          'hidden_count': int(tds[6].text.strip() or 0),
        }
        abilities.append(ability)
  save_to_file(f'{PATH}/ability_list.json', abilities)
  return abilities

if __name__ == '__main__':
  ability_list = get_ability_list()
  for ability in ability_list:
    index = ability['index']
    name = ability['name']
    file_name = f'{PATH}/ability/{index}-{name}.json'
    if file_exists(file_name):
      print(f'{name} 已存在, 跳过...')
      continue
    print(f'正在获取 {name}...')
    data = get_ability(ability_simple=ability)
    save_to_file(file_name, data)