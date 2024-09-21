

from bs4 import BeautifulSoup
import requests


PATH = './../data'

def get_move_list(move):
  url = f'https://wiki.52poke.com/wiki/{move['name']}'

  response = requests.get(url)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  move_detail = move
  effect_text = get_effect_text(soup)
  range = get_range(soup)
  move_detail['effect'] = effect_text
  move_detail['range'] = range



def get_effect_text(soup):
  tag_el = soup.find('span', id="招式附加效果")
  effect_p = tag_el.parent.find_next_sibling('p')
  effect_text = ''

  while effect_p and effect_p.name == 'p':
    for sup in effect_p.find_all('sup'):
      sup.decompose()

    effect_text += effect_p.get_text()
    effect_p = effect_p.find_next_sibling()
  
  return effect_text

def get_range(soup):
  tag_el = soup.find('a', title="范围").find_parent('tr')
  text = tag_el.find_next_sibling('tr').find_next_sibling('tr').text.strip()
  return text