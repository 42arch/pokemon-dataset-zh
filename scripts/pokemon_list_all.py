
from bs4 import BeautifulSoup
import requests

from pokemon import get_pokemon_data
from fixed_data import NEW_NAMES
from utils import file_exists, save_to_file

PATH = 'data'

NATIONAL_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按全国图鉴编号）/简单版'
KANTO_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按关都图鉴编号）'
JOHTO_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按城都图鉴编号）'
HOENN_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按丰缘图鉴编号）'
SINNOH_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按神奥图鉴编号）'
UNOVA_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按合众图鉴编号）'
NEW_UNOVA_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按新合众图鉴编号）'
KALOS_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按卡洛斯图鉴编号）'
NEW_ALOLA_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按新阿罗拉图鉴编号）'
GALAR_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按伽勒尔图鉴编号）'
ISLE_OF_ARMOR_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按铠岛图鉴编号）'
CROWN_TUNDRA_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按王冠雪原图鉴编号）'
HISUI_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按洗翠图鉴编号）'
PALDEA_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按帕底亚图鉴编号）'
KITAKAMI_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按北上图鉴编号）'
BLUEBERRY_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按蓝莓图鉴编号）'
LUMIOSE_URL = 'https://wiki.52poke.com/wiki/宝可梦列表（按密阿雷图鉴编号）'

headers = {
  'Accept-Language': 'zh-Hans'
}

def get_national_pokemon_list():
  url = NATIONAL_URL
  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  table = soup.find('table', class_='eplist')
  tr_list = table.find_all('tr')

  pokemon_list = []

  for tr in tr_list:
    td_list = tr.find_all('td')

    if len(td_list) == 4:
      index_no = td_list[0].text.strip().replace('#', '')
      name = td_list[1].find('a').text.strip()
      name_en = td_list[3].find('a').text.strip()
      name_jp = td_list[2].find('a').text.strip()
      pokemon_list.append({
        'index': index_no,
        'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        'name_en': name_en,
        'name_jp': name_jp
      })
  save_to_file(f'{PATH}/pokedex_national.json', pokemon_list)

  return pokemon_list

def get_kanto_pokemon_list():
  url = KANTO_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = td_list[3].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })
    
    
  save_to_file(f'{PATH}/pokedex_kanto.json', pokemon_list)

  return pokemon_list

def get_johto_pokemon_list():
  url = JOHTO_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 7:
        index = td_list[1].text.strip().replace('#', '')
        national_index = td_list[2].text.strip().replace('#', '')
        name = td_list[4].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': f'0{national_index}',
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })
    
  save_to_file(f'{PATH}/pokedex_johto.json', pokemon_list)

  return pokemon_list

def get_hoenn_pokemon_list():
  url = HOENN_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 7:
        index = td_list[1].text.strip().replace('#', '')
        national_index = td_list[2].text.strip().replace('#', '')
        name = td_list[4].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': f'0{national_index}',
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_hoenn.json', pokemon_list)

  return pokemon_list

def get_sinnoh_pokemon_list():
  url = SINNOH_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = td_list[3].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_sinnoh.json', pokemon_list)

  return pokemon_list

def get_unova_pokemon_list():
  url = UNOVA_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = td_list[3].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_unova.json', pokemon_list)

  return pokemon_list

def get_new_unova_pokemon_list():
  url = NEW_UNOVA_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = td_list[3].find('a').text.strip()

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_unova_new.json', pokemon_list)

  return pokemon_list

def get_kalos_pokemon_list():
  url = KALOS_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  region_idx_dict = {
    0: 'central',
    1: 'coastal',
    2: 'mountain'
  }


  for idx, table in enumerate(tables):
    print(len(tables), idx)
    region_pokemon_list = []

    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = td_list[3].find('a').text.strip().replace('‎', '')

        print(name, index, national_index)

        region_pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })
    save_to_file(f'{PATH}/pokedex_kalos_{region_idx_dict[idx]}.json', region_pokemon_list)

  return pokemon_list

def get_alola_pokemon_list():
  url = NEW_ALOLA_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  region_idx_dict = {
    0: 'melemele',
    1: 'akala',
    2: 'ulaula',
    3: 'poni'
  }


  for idx, table in enumerate(tables[0:4]):
    region_pokemon_list = []

    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text


        print(name, index, national_index)

        region_pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })
    
    save_to_file(f'{PATH}/pokedex_alola_{region_idx_dict[idx]}.json', region_pokemon_list)


  full_tables = tables[4:]
  for table in full_tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })
    
  save_to_file(f'{PATH}/pokedex_alola.json', pokemon_list)

  return pokemon_list

def get_galar_pokemon_list():
  url = GALAR_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_galar.json', pokemon_list)

  return pokemon_list

def get_isle_of_armor_pokemon_list():
  url = ISLE_OF_ARMOR_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_isle_of_armor.json', pokemon_list)

  return pokemon_list

def get_crown_tundra_pokemon_list():
  url = CROWN_TUNDRA_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_crown_tundra.json', pokemon_list)

  return pokemon_list

def get_hisui_pokemon_list():
  url = HISUI_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables[0:5]:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_hisui.json', pokemon_list)

  return pokemon_list

def get_paldea_pokemon_list():
  url = PALDEA_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_paldea.json', pokemon_list)

  return pokemon_list

def get_kitakami_pokemon_list():
  url = KITAKAMI_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_kitakami.json', pokemon_list)

  return pokemon_list

def get_blueberry_pokemon_list():
  url = BLUEBERRY_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_blueberry.json', pokemon_list)

  return pokemon_list

def get_lumiose_pokemon_list():
  url = LUMIOSE_URL

  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  tables = soup.find_all('table', class_='eplist')

  pokemon_list = []

  for table in tables:
    tr_list = table.find_all('tr')

    for tr in tr_list:
      td_list = tr.find_all('td')

      if len(td_list) == 6:
        index = td_list[0].text.strip().replace('#', '')
        national_index = td_list[1].text.strip().replace('#', '')
        name = f'''{td_list[3].find('a').text}-{td_list[3].find('small').text}''' if td_list[3].find('small') else td_list[3].find('a').text

        print(name, index, national_index)

        pokemon_list.append({
          'index': index,
          'national_index': national_index,
          'name': NEW_NAMES[name] if name in NEW_NAMES else name,
        })

  save_to_file(f'{PATH}/pokedex_lumiose.json', pokemon_list)

  return pokemon_list


if __name__ == '__main__':
  # national_pokemon_list = get_national_pokemon_list()
  # kanto_pokemon_list = get_kanto_pokemon_list()
  # johto_pokemon_list = get_johto_pokemon_list()
  # hoenn_pokemon_list = get_hoenn_pokemon_list()
  # sinnoh_pokemon_list = get_sinnoh_pokemon_list()
  # unova_pokemon_list = get_unova_pokemon_list()
  # new_unova_pokemon_list = get_new_unova_pokemon_list()
  # kalos_pokemon_list = get_kalos_pokemon_list()
  # alola_pokemon_list = get_alola_pokemon_list()
  # galar_pokemon_list = get_galar_pokemon_list()
  # crown_tundra_pokemon_list = get_crown_tundra_pokemon_list()
  # isle_of_armor_pokemon_list = get_isle_of_armor_pokemon_list()
  # hisui_pokemon_list = get_hisui_pokemon_list()
  # paldea_pokemon_list = get_paldea_pokemon_list()
  # kitakami_pokemon_list = get_kitakami_pokemon_list()
  # blueberry_pokemon_list = get_blueberry_pokemon_list()
  lumiose_pokemon_list = get_lumiose_pokemon_list()

