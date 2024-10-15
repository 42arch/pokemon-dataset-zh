
import re
from bs4 import BeautifulSoup
import requests

from fixed_data import FIXED_EVOLUTION_DATA, FIXED_EVOLUTION_POKEMONS
from utils import save_image, save_to_file

PATH = './../data'

def get_pokemon_data(name, index, name_en, name_jp):
  headers = {
    'Accept-Language': 'zh-Hans'
  }

  url = f"https://wiki.52poke.com/wiki/{name}"
  response = requests.get(url, headers=headers)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  for tag in soup.find_all(True):
    if tag.get('style') and 'display:none' in tag.get('style'):
      tag.decompose

  data = {
    'name': name,
    'index': index,
    'name_en': name_en,
    'name_jp': name_jp
  }

  names = get_form_names(soup)

  lang_names = get_names(soup, name)
  forms = get_form_infos(soup, names, name, index)
  profile = get_profile(soup)
  flavor_texts = get_flavor_texts(soup)
  # 部分宝可梦进化链手动处理
  evolution_chains = get_evolution_chains(soup, name) if name not in FIXED_EVOLUTION_POKEMONS else FIXED_EVOLUTION_DATA[name]
  stats = get_stats(soup)
  moves = get_moves(soup)
  home_images = get_home_images(soup, name, index)
  data['profile'] = profile
  data['forms'] = forms
  data['stats'] = stats
  data['flavor_texts'] = flavor_texts
  data['evolution_chains'] = evolution_chains
  data['names'] = lang_names
  data['moves'] = moves
  data['home_images'] = home_images

  return data

def get_form_names(soup):
  names = []
  form_table = soup.find('table', id='multi-pm-form-table')
  if form_table:
    name_tr_list = form_table.select('tr.md-hide:not(.hide)')
    for tr in name_tr_list:
      name = tr.select('th')[0].text.strip()
      names.append(name)
  else:
    names.append('')

  return names

def get_form_infos(soup, names, pokemon_name, pokemon_index):
  infos = []
  info_table_list = soup.select('table.roundy.a-r.at-c')

  for index, form in enumerate(info_table_list):
    if index < len(names):
      name = names[index] if names[index] != '' else pokemon_name
      name = name if pokemon_name in name else f'{pokemon_name}-{name}'
      form_info = {
        "name": name,
        "index": pokemon_index if index == 0 else f'{pokemon_index}.{index}',
        "is_mega": False,
        "is_gmax": False,
      }
      if '超级' in name:
        form_info['is_mega'] = True
      elif '极巨化' in name:
        form_info['is_gmax'] = True

      image_name = f'{form_info["index"]}-{name}'
      form_info['image'] = f'{image_name}.png'
      td_list = form.select('.fulltable')

      for td in td_list:
        # types
        type_a = td.find('a', attrs={'title': '属性'})
        if type_a:
          type_spans = td.select('span.type-box-9-text')
          types = []
          for span in type_spans:
            types.append(span.text.strip())
          form_info['types'] = types
        
        # genus
        genus_a = td.find('a', attrs={'title': '分类'})
        if genus_a:
          genus_el = td.select('td > a')[0]
          for el in genus_el:
            form_info['genus'] = el.text.strip()
        
        # ability
        ability_a = td.find('a', attrs={'title': '特性'})
        if ability_a:
          ability_el = ability_a.parent.find_next('table').find_all('td')
          abilities = []
          for a in ability_el[0].find_all('a'):
            name = a.text.strip()
            abilities.append({
              'name': name,
              'is_hidden': False
            })
          if len(ability_el) > 1:
            for a in ability_el[1].find_all('a'):
              name = a.text.strip()
              abilities.append({
                'name': name,
                'is_hidden': True
              })
          form_info['ability'] = abilities
        
        # experience
        experience_a = td.find('a', attrs={'title': '经验值'})
        if experience_a:
          experience_el = td.select('td > table')

          for el in experience_el:
            exp = el.select('td')[0].contents[0].text.strip()
            speed = el.select('small')[0].text.strip().replace('（', '').replace('）', '') if el.select('small') else ''
            form_info['experience'] = {
              'number': exp,
              'speed': speed
            }
      
        # height weight
        height_a = td.find_all(string=lambda text: '身高' in text if text else False)
        if height_a:
          height = td.select('td.roundy')[0].text.strip()
          form_info['height'] = height
        weight_a = td.find_all(string=lambda text: '体重' in text if text else False)
        if weight_a:
          weight = td.select('td.roundy')[0].text.strip()
          form_info['weight'] = weight

      # image
      img_el = form.select('.roundy.bgwhite.fulltable')[0].find('img')

      image_url = img_el.get('data-url')
      image_path = f'{PATH}/images/official/{image_name}.png'
      # save_image(image_path, f'https:{image_url}')
      
      # gender rate
      gender_a = form.find('a', attrs={'title': '宝可梦列表（按性别比例分类）'})
      if gender_a:
        gender_table = gender_a.parent.find_next('table')
        male_el = gender_table.find('span', attrs={
          'style': 'color:#00F;'
        })
        male = re.findall(r'\d+\.?\d*%', male_el.text.strip())[0] if male_el else None
        # male = re.search(r'\d+%', male_el.text.strip()).group() if male_el else None
        female_el = gender_table.find('span', attrs={
          'style': 'color:#FF6060;'
        })
        female = re.findall(r'\d+\.?\d*%', female_el.text.strip())[0] if female_el else None
        # female = re.search(r'\d+%', female_el.text.strip()).group() if female_el else None
        form_info['gender_rate'] = {
          'male': male,
          'female': female
        } if male or female else None
      infos.append(form_info)

      # shape
      shape_a = form.find('a', attrs={'title': '宝可梦列表（按体形分类）'})
      if shape_a:
        shape_el = shape_a.parent.find_next('table').find('a')
        form_info['shape'] = shape_el.get('title')
      
      # color
      color_a = form.find('a', attrs={'title': '宝可梦列表（按颜色分类）'})
      if color_a:
        color_el = color_a.parent.find_next('table').find('span')
        form_info['color'] = color_el.text.strip()

      # catch rate
      catch_a = form.find('a', attrs={'title': '捕获率'})
      if catch_a:
        catch_el = catch_a.parent.find_next('table').find('td')
        num = catch_el.contents[0].strip()
        rate = catch_el.find('span').text.strip() if catch_el.find('span') else None
        form_info['catch_rate'] = {
          'number': num,
          'rate': rate
        }

      # raise
      raise_a = form.find('a', attrs={'title': '宝可梦培育'})
      if raise_a:
        egg_groups = []
        raise_td_list = raise_a.parent.find_next('table').find_all('td')
        egg_group_a_list = raise_td_list[0].find_all('a')
        for a in egg_group_a_list:
          egg_group = a.text.strip().replace('群', '')
          egg_groups.append(egg_group)
        form_info['egg_groups'] = egg_groups

  return infos

def get_names(soup, name):
  names = {
    'zh_hans': name
  }
  name_table = soup.find('table', {
    'class': 'wiki-nametable'
  })

  name_tr_list = name_table.select('tr.varname1')

  for tr in name_tr_list:
    tr_cn = tr.find_all(string=lambda text: '任天堂' == text if text else False)
    tr_en = tr.find_all(string=lambda text: '英文' in text if text else False)
    tr_fr = tr.find_all(string=lambda text: '英文' in text if text else False)
    tr_es = tr.find_all(string=lambda text: '西班牙文' in text if text else False)
    tr_it = tr.find_all(string=lambda text: '意大利文' in text if text else False)
    tr_de = tr.find_all(string=lambda text: '德文' in text if text else False)

    if tr_cn:
      name_zh_hant = tr.select('td')[2].contents[0].strip() if tr.select('td') else name
      names['zh_hant'] = name_zh_hant
    if tr_en:
      name_en = tr.select('td')[2].text.strip()
      names['en'] = name_en
    if tr_fr:
      name_fr = tr.select('td')[2].text.strip()
      names['fr'] = name_fr
    if tr_es:
      name_es = tr.select('td')[2].text.strip()
      names['es'] = name_es
    if tr_de:
      name_de = tr.select('td')[2].text.strip()
      names['de'] = name_de
    if tr_it:
      name_it = tr.select('td')[2].text.strip()
      names['it'] = name_it

  name_ja = name_table.find('span', attrs={'lang': 'ja'}).text.strip()
  names['ja'] = name_ja
  name_ko = name_table.find('span', attrs={'lang': 'ko'})
  names['ko'] = name_ko.text.strip() if name_ko else None
  return names

def get_profile(soup):
  # tag_span = soup.find('span', id=lambda x: x in ['概述', '概要'])
  profile_p = soup.find('span', id=lambda x: x in ['概述', '基本介绍']).parent.find_next_sibling('p')
  profile_text = ''
  while profile_p and profile_p.name == 'p':
    for sup in profile_p.find_all('sup'):
      sup.decompose()

    profile_text += profile_p.get_text()
    profile_p = profile_p.find_next_sibling()
  return profile_text

def get_flavor_texts(soup):
  texts = []
  # flavor_table = soup.find('span', id='图鉴介绍').parent.find_next_sibling()
  flavor_table = soup.find('span', id=lambda x: x in ['图鉴介绍', '圖鑑介绍', '圖鑑介紹']).parent.find_next_sibling()
  generation_th_list = flavor_table.select('th.roundytop-5')

  for th in generation_th_list:
    generation = {
      'name': th.text.strip(),
    }
    tr = th.find_parent('tr')
    text_table_list = tr.find_next_sibling().find_all('table')
    versions = []


    for table in text_table_list:
      for tr in table.find_all('tr'):
        version_table = tr.find('table')
        if version_table:
          text_td = tr.find_all('td')[1]

          if text_td:
            # text = text_td.text.strip()
            text_parts = []
            for content in text_td.contents:
                if content.name == 'small':
                    text_parts.append(content.get_text(strip=True) + '\n')
                else:
                    text_parts.append(content.string.strip() if content.string else '')
            text = ''.join(text_parts).strip().replace(' ', '')

          for a in version_table.find_all('a'):
            version_group_name = a.get('title')
            version_name = a.text.strip()

            if "{{{" in text or "}}}" in text or text == "":
              pass
            else:
              version = {
                'name': version_name,
                'group': version_group_name,
                'text': text
              }

              version_name_exist = any(d['name'] == version_name for d in versions)
              if version_name_exist is False:
                versions.append(version)

    generation['versions'] = versions
    texts.append(generation)
  
  return texts

def get_evolution_chains(soup, name):
  evo_tag = soup.find('span', id=lambda x: x in ['进化', '進化'])
  if not evo_tag:
    return [{'name': name, 'stage': '不进化', "text": None, "back_text": None, "from": None}]
  tag_h1 = evo_tag.parent

  # multi_form_table = tag_h1.find_next('table', class_='a-c')
  form_table = tag_h1.find_next('table')
  if 'fulltable' in form_table.get('class'):
    form_table = form_table.find_next('table')

  # evolution_table = multi_form_table if multi_form_table else single_form_table
  evolution_table = form_table
  has_multiple_forms(evolution_table)

  tr_list = evolution_table.find('tbody').find_all('tr', recursive=False, class_=lambda x: x != 'hide')
  form_tr_list = split_form_tr_list(tr_list) if has_multiple_forms(evolution_table) else [tr_list]
  chains = []

  for tr_list in form_tr_list:
    chain = get_single_evolution_chain(tr_list)
    chains.append(chain)

  return chains

def get_single_evolution_chain(tr_list):
  all_td_list = []
  def get_pokemon(td):
    name_el = td.select('table tbody tr .textblack')[0].find('a')
    image_el = td.select('table tbody')[0].find('a', class_='image')
    name = name_el.text
    form_name = None
    image = image_el.get('href').split('File:')[1]
    
    if td.find('a', { 'title': '地区形态'}):
      form_name = td.find('a', { 'title': '地区形态' }).text
    if td.find('a', { 'title': '形态变化' }):
      form_name = td.find('a', { 'title': '形态变化' }).text
    # if form_name:
    #   name = name + '-' + form_name.text

    
    stage_el = name_el.parent.parent.find_previous('tr').find('small')
    stage = stage_el.text
    return {"name": name, "stage": stage, "form_name": form_name, "image": image}

  for tr in tr_list:
    td_list = tr.find_all('td', recursive=False)
    for td in td_list:
      if td.get('class') and 'hide' in td.get('class'):
        continue
      if td.text.strip() != '进化时，如果……':
        all_td_list.append(td)

  nodes = []
  for index, td in enumerate(all_td_list):
    node = {
      'name': None,
      'stage': None,
      'text': None,
      'image': None,
      'back_text': None,
      'from': None,
      # 'next_to': None
    }
    if index == 0:
      res = get_pokemon(td)
      node['name'] = res['name']
      node ['form_name'] = res['form_name']
      node ['image'] = res['image']
      node['stage'] = res['stage']
      nodes.append(node)
    else:
      if index % 2 == 0:
        con_td = all_td_list[index - 1] # 进化条件 元素
        from_td = all_td_list[index - 2]
        condition = get_evolution_condition(con_td)
        res = get_pokemon(td)
        from_res = get_pokemon(from_td)
        node['name'] = res['name']
        node ['form_name'] = res['form_name']
        node ['image'] = res['image']
        node['stage'] = res['stage']
        node['text'] = condition['text']
        node['back_text'] = condition['back_text']

        if from_res and from_res['stage'] != res['stage']:
          node['from'] = from_res['name']
        if from_res and from_res['stage'] == res['stage'] and node['stage'] != '未进化' and node['stage'] != '幼年':
          node['from'] = nodes[-1]['from']

        nodes.append(node)
      else:
        pass
  return nodes

def get_evolution_condition(td):
    level = ''
    happiness = ''
    friendliness = ''
    item = ''
    evo_text = ''
    back_text = ''
    # level_el = con_td.find('a', attrs={
    #   'title': '等级'
    # })
    # level = level_el.next_sibling.text.strip() if level_el else ''
    # happiness_el = con_td.find('a', attrs={
    #   'title': '亲密度'
    # })
    # happiness = happiness_el.next_sibling.next_sibling.text.strip().replace('或', '') if happiness_el else ''
    # friendliness_el = con_td.find('a', attrs={
    #   'title': '友好度'
    # })
    # friendliness = friendliness_el.next_sibling.next_sibling.text.strip() if friendliness_el else ''
    td_contents = td.get_text()
    evo_text = td_contents.strip()
    if '←' in td_contents:
        back_text = td_contents.split('←', 1)[1].strip()
    if '→' in td_contents:
        evo_text = td_contents.split('→', 1)[0].strip()
    

    return { "text": evo_text, "back_text": back_text }

def split_form_tr_list(tr_list):
  length = len(tr_list)
  middle_index = length // 2
  if length % 2 == 0:
    left_half = tr_list[:middle_index]
    right_half = tr_list[middle_index:]
  else:
    left_half = tr_list[:middle_index]
    right_half = tr_list[middle_index+1:]
  return [left_half, right_half]

def has_multiple_forms(table):
  stage_el_list = table.select('small')
  flag_count = 0
  for el in stage_el_list:
    stage = el.text
    if stage == '未进化' or stage == '幼年':
      flag_count += 1
  return flag_count > 1

def get_stats(soup):
    stats_tag = soup.find('span', id='种族值').parent
    table_el = stats_tag.find_next('table')
    table_list = []
    stats_form_names = []
    if 'at-c' in table_el.get('class'):
      stats_table_forms = table_el.find_all('span', class_='toggle-pbase')
      for sp in stats_table_forms:
        stats_form_names.append(sp.text.strip())
      for i in range(len(stats_table_forms)):
        table_list.append(table_el.find_next('table'))
        table_el = table_el.find_next('table')
    else:
      table_list = [table_el]
      stats_form_names = ['一般']
    stats =[]

    for index, stats_table in enumerate(table_list):
      hp = stats_table.find('tr', class_='bgl-HP').find('span', attrs={
        'style': 'float:right'
      }).text
      attack = stats_table.find('tr', class_='bgl-攻击').find('span', attrs={
        'style': 'float:right'
      }).text
      defense = stats_table.find('tr', class_='bgl-防御').find('span', attrs={
        'style': 'float:right'
      }).text
      sp_attack = stats_table.find('tr', class_='bgl-特攻').find('span', attrs={
        'style': 'float:right'
      }).text
      sp_defense = stats_table.find('tr', class_='bgl-特防').find('span', attrs={
        'style': 'float:right'
      }).text
      speed = stats_table.find('tr', class_='bgl-速度').find('span', attrs={
        'style': 'float:right'
      }).text
      result = {
        'form': stats_form_names[index],
        'data': {
          'hp': hp,
          'attack': attack,
          'defense': defense,
          'sp_attack': sp_attack,
          'sp_defense': sp_defense,
          'speed': speed
        }
      }
      stats.append(result)
    return stats


def get_moves(soup):
  moves = []
  all_learned_moves = []
  all_machine_moves = []
  learned_table_list  = []
  machine_table_list = []
  learned_form_names = []
  machine_form_names = []

  learned_table_el = soup.find('span', id="可学会的招式").parent.find_next('table')
  if 'fulltable' in learned_table_el.get('class'):
    form_names_els = learned_table_el.find_all('span', class_='toggle-p')
    for sp in form_names_els:
      learned_form_names.append(sp.text.strip())
    for i in range(len(form_names_els)):
      next_table = learned_table_el.find_next('table', class_='at-c')
      learned_table_list.append(next_table)
      learned_table_el = next_table
  else:
    learned_table_list = [learned_table_el]
    learned_form_names = ['一般']

  for index, move_table in enumerate(learned_table_list):
    learned_move_tr_list = move_table.find_all('tr', class_='at-c')
    learned_moves = []

    for tr in learned_move_tr_list:
      for td in tr.find_all('td', class_='hide'):
        td.decompose()
      for td in tr.find_all('td', attrs={
        'style': 'display: none'
      }):
        td.decompose()
      td_list = tr.find_all('td')
      move= {
        "level_learned_at": td_list[0].text.strip(),
        "machine_used": None,
        "method": '提升等级',
        "name": td_list[1].find('a').text.strip(),
        "flavor_text": td_list[1].find('span', class_='explain').get('title'),
        "type": td_list[2].find('a').text.strip(),
        "category": td_list[3].text.strip(),
        "power": td_list[4].text.strip(),
        "accuracy": td_list[5].text.strip(),
        "pp": td_list[6].text.strip(),
      }
      learned_moves.append(move)

    result = {
      "form": learned_form_names[index],
      "data": learned_moves
    }
    all_learned_moves.append(result)


  machine_table_el = soup.find('span', id="能使用的招式学习器").parent.find_next('table')
  if 'fulltable' in machine_table_el.get('class'):
    form_names_els = machine_table_el.find_all('span', class_='toggle-p')
    for sp in form_names_els:
      machine_form_names.append(sp.text.strip())
    for i in range(len(form_names_els)):
      next_table = machine_table_el.find_next('table', class_='at-c')
      machine_table_list.append(next_table)
      machine_table_el = next_table
  else:
    machine_table_list = [machine_table_el]
    machine_form_names = ['一般']
  
  for index, move_table in enumerate(machine_table_list):
    machine_move_tr_list = move_table.find_all('tr', class_='at-c')
    machine_moves = []
    for tr in machine_move_tr_list:
      for td in tr.find_all('td', class_='hide'):
        td.decompose()
      for td in tr.find_all('td', attrs={
        'style': 'display: none'
      }):
        td.decompose()
      td_list = tr.find_all('td')
      move= {
        "level_learned_at": None,
        "machine_used": td_list[1].find('a').text.strip(),
        "method": '招式学习器',
        "name": td_list[2].find('a').text.strip(),
        "flavor_text": td_list[2].find('span', class_='explain').get('title'),
        "type": td_list[3].find('a').text.strip(),
        "category": td_list[4].text.strip(),
        "power": td_list[5].text.strip(),
        "accuracy": td_list[6].text.strip(),
        "pp": td_list[7].text.strip(),
      }
      machine_moves.append(move)

    result = {
      "form": machine_form_names[index],
      "data": machine_moves
    }
    all_machine_moves.append(result)

  return {
    "learned": all_learned_moves,
    "machine": all_machine_moves
  }

def get_home_images(soup, name, index):
  home_images = []
  tag_el = soup.find('span', id="形象").parent.find_next_sibling('div')

  table = tag_el.find('a', title="Pokémon HOME").parent.parent.parent
  tr_list = table.find_all('tr', class_="bgwhite")
  td_list = table.find_all('td')

  for td in td_list:
    is_shiny = True if td.find('img', alt='ShinyHOMEStar.png') else False
    extra_name = ''
    extra_image_el_list = td.find_all('img')
    for el in extra_image_el_list:
      if '糖饰' in el.get('alt'):
        extra_name = f'''-{el.get('alt')}'''

    form_name = td.text.strip().replace('?', '？')
    item_name = f'{name}-{form_name}{extra_name}' if form_name else name
    image = td.find('img').get('data-url')
    if is_shiny is False:
      image_name = f'{index}-{name}-{form_name}{extra_name}.png' if form_name else f'{index}-{name}{extra_name}.png'
      # save_image(f'{PATH}/images/home/{image_name}', f'https:{image}')
      item = {
        'name': item_name,
        'image': image_name,
      }
      home_images.append(item)
    else:
      image_name =  f'{index}-{name}-{form_name}{extra_name}-shiny.png' if form_name else f'{index}-{name}{extra_name}-shiny.png'
      # save_image(f'{PATH}/images/home/{image_name}', f'https:{image}')
      exist_item = next((item for item in home_images if item["name"] == item_name), None)
      if exist_item:
        exist_item['shiny'] = image_name
      else:
        item = {
          'name': item_name,
          'shiny': image_name,
        }
        home_images.append(item)

  return home_images

if __name__ == '__main__':
  name = '尼多朗'
  data = get_pokemon_data(name, index='111', name_en='1', name_jp='1')
  save_to_file(f'{PATH}/pokemon/{name}.json', data)


# 测试： 皮卡丘，呆呆兽，小拳石，九尾, 无畏小子，宝宝丁，阿尔宙斯，霜奶仙, 多边兽2型,太乐巴戈斯