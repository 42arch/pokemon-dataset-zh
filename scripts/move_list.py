# -*- coding: utf-8 -*-

from bs4 import BeautifulSoup
import requests

from utils import save_to_file

PATH = './../data'

def get_move_list():
  url = 'https://wiki.52poke.com/wiki/招式列表'
  response = requests.get(url)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  moves = []
  move_tables = soup.find_all('table', class_='hvlist')
  
  for table in move_tables:
    generation = table.find_previous('h2').text.strip()
    tr_list = table.find('tbody').find_all('tr')
    for tr in tr_list:
      if tr.get('data-type'):
        tds = tr.find_all('td')
        move = {
          'index': tds[0].text.strip(),
          'generation': generation,
          'name': tds[1].find('a').text.strip(),
          'name_jp': tds[2].text.strip(),
          'name_en': tds[3].text.strip(),
          'type': tds[4].find('a').text.replace('惡', '恶').strip(),
          'category': tds[5].find('a').text.strip(),
          'power': tds[6].text.strip(),
          'accuracy': tds[7].text.strip(),
          'pp': tds[8].text.strip(),
          'text': tds[9].text.strip(),
        }
        moves.append(move)
  save_to_file(f'{PATH}/move_list.json', moves)
  return moves

if __name__ == '__main__':
  get_move_list()