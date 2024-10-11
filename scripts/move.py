# -*- coding: utf-8 -*-

from bs4 import BeautifulSoup
import requests

from utils import save_to_file

PATH = './../data/move'

T_MOVE = ['灼热暴冲', '黑暗暴冲', '剧毒暴冲', '格斗暴冲', '魔法暴冲']

def get_move(move_simple):
  headers = {
    'Accept-Language': 'zh-Hans'
  }
  name = move_simple['name']
  generation = move_simple['generation']
  url = f'https://wiki.52poke.com/wiki/{name}（招式）' if name in T_MOVE else f'https://wiki.52poke.com/wiki/{name}'
  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  move_detail = move_simple

  # effect
  effect_tag = soup.find('span', id="招式附加效果").find_parent('h2')
  effect_p = effect_tag.find_next_sibling('p')
  effect_text = ''
  while effect_p and effect_p.name == 'p':
    effect_text += effect_p.get_text()
    effect_p = effect_p.find_next_sibling()
  move_detail['effect'] = effect_text

  # info
  info_text = []
  info_table = soup.find('table', class_="a-r")
  info_li_list = info_table.find('ul').find_all('li')
  for li in info_li_list:
    info_text.append(li.text.strip())
  move_detail['info'] = info_text

  # range
  range_el = info_table.find('a', title="范围").find_parent('tr').find_next_sibling('tr').find_next_sibling('tr')
  range_text = range_el.text.strip()
  move_detail['range'] = range_text

  # pokemon
  pokemons = {
    "level": [],
    "machine": [],
    "egg": [],
    "tutor": [],
  }
  # level
  level_el = soup.find('span', id="通过等级提升")
  if level_el:
    level_table = level_el.find_parent(['h3', 'h4']).find_next_sibling('table')
    level_tr_list = level_table.find_all('tr', class_="bgwhite")
    for tr in level_tr_list:
        tds = tr.find_all('td')
        name = '-'.join([a.text.strip() for a in tds[2].find_all('a')])
        pokemon = {
          "index": tds[0].text.strip(),
          "name": name
        }
        pokemons["level"].append(pokemon)

  # machine
  machine_el = soup.find('span', id="通过招式学习器")
  if machine_el:
    machine_table = machine_el.find_parent('h3').find_next_sibling('table')
    machine_tr_list = machine_table.find_all('tr', class_="bgwhite")
    for tr in machine_tr_list:
        tds = tr.find_all('td')
        name = '-'.join([a.text.strip().replace('\u200e', '') for a in tds[2].find_all('a')])
        pokemon = {
          "index": tds[0].text.strip(),
          "name": name
        }
        pokemons["machine"].append(pokemon)

  # egg
  egg_el = soup.find('span', id=lambda x: x in ["通过遺傳", "通过遗传", "通過遺傳"])
  if egg_el:
    egg_table = egg_el.find_parent('h3').find_next_sibling('table')
    egg_tr_list = egg_table.find_all('tr', class_="bgwhite")
    for tr in egg_tr_list:
        tds = tr.find_all('td')
        name = '-'.join([a.text.strip() for a in tds[2].find_all('a')])
        pokemon = {
          "index": tds[0].text.strip(),
          "name": name
        }
        pokemons["egg"].append(pokemon)

  # tutor
  tutor_el = soup.find('span', id="通过教授招式")
  if tutor_el:
    tutor_table = tutor_el.find_parent('h3').find_next_sibling('table')
    tutor_tr_list = tutor_table.find_all('tr', class_="bgwhite")
    for tr in tutor_tr_list:
        tds = tr.find_all('td')
        name = '-'.join([a.text.strip() for a in tds[2].find_all('a')])
        pokemon = {
          "index": tds[0].text.strip(),
          "name": name
        }
        pokemons["tutor"].append(pokemon)

  move_detail['pokemon'] = pokemons

  return move_detail

if __name__ == '__main__':
  move_data = get_move({
        "index": "249",
        "generation": "第二世代",
        "name": "碎岩",
        "name_jp": "いわくだき",
        "name_en": "Rock Smash",
        "type": "格斗",
        "category": "物理",
        "power": "40",
        "accuracy": "100",
        "pp": "15",
        "text": "用拳头进行攻击。有时会降低对手的防御。"
    })
  index = move_data['index']
  name = move_data['name']
  save_to_file(f'{PATH}/{index}-{name}.json', move_data)