# -*- coding: utf-8 -*-

from bs4 import BeautifulSoup
import requests

from utils import save_to_file

PATH = './../data/ability'


def get_ability(ability_simple):
  headers = {
    'Accept-Language': 'zh-Hans'
  }
  name = ability_simple["name"]
  url = f'https://wiki.52poke.com/wiki/{name}（特性）'
  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  ability_detail = ability_simple

  # effect
  effect_tag = soup.find('span', id=lambda x: x in ["特性效果", "游戏中"]).find_parent('h2')
  effect_p = effect_tag.find_next_sibling(['p', 'ul'])
  effect_text = ''
  while effect_p and effect_p.name == 'p' or effect_p.name == 'ul':
    effect_text += effect_p.get_text()
    effect_p = effect_p.find_next_sibling()
  ability_detail['effect'] = effect_text

  # info
  info_text = []
  info_table = soup.find('table', class_="a-r")
  info_li_list = info_table.find('ul').find_all('li')
  for li in info_li_list:
    info_text.append(li.text.strip())
  ability_detail['info'] = info_text
  
  # pokemons
  pokemon_list = []
  pokemon_tag = soup.find('span', id="具有该特性的宝可梦")
  if pokemon_tag:
    pokemon_table = pokemon_tag.parent.find_next_sibling('table')
    tr_list = pokemon_table.find('tbody').find_all('tr', class_="bgwhite")
    for idx, tr in enumerate(tr_list):
      tds = tr.find_all('td')
      ths = tr.find_all('th')
      name = '-'.join([a.text.strip() for a in tds[2].find_all('a')])
      types = [tds[3].text.strip()]
      if tds[4].text.strip() != '[[（属性）|]]':
        types.append(tds[4].text.strip())
      
      pokemon = {
        "index": tds[0].text.strip(),
        "name": name,
        "types": types,
        "first": ths[0].text.strip(),
        "second": ths[1].text.strip() if len(ths) > 2 else None,
        "hidden": ths[-1].text.strip(),
      }
      pokemon_list.append(pokemon)
    ability_detail["pokemon"] = pokemon_list
  return ability_detail


if __name__ == '__main__':
  ability_data = get_ability({
        "index": "283",
        "generation": "第九世代",
        "name": "黄金之躯",
        "name_jp": "おうごんのからだ",
        "name_en": "Good as Gold",
        "text": "不会氧化的坚固黄金身躯不会受到对手的变化招式的影响。",
        "common_count": 1,
        "hidden_count": 0
  })
  index = ability_data['index']
  name = ability_data['name']
  save_to_file(f'{PATH}/{index}-{name}.json', ability_data)

