# -*- coding: utf-8 -*-

import json
from bs4 import BeautifulSoup
import requests


def get_data(name):
  headers = {
    'Accept-Language': 'zh-Hans'
  }

  url = f"https://wiki.52poke.com/wiki/{name}"
  response = requests.get(url, headers=headers)
  response.raise_for_status()

  soup = BeautifulSoup(response.text, "html.parser")

  # remove_display_none(soup)

  for tag in soup.find_all(True):
    if tag.get('style') and 'display:none' in tag.get('style'):
      tag.decompose

  data = {
    'name': name,
  }

  names = get_form_names(soup)

  lang_names = get_names(soup, name)
  forms = get_form_infos(soup, names)
  profile = get_profile(soup)
  flavor_texts = get_flavor_texts(soup)
  evolution_chains = get_evolution_chains(soup, name)

  print(3333, json.dumps(evolution_chains, ensure_ascii=False))

  data['forms'] = forms
  data['profile'] = profile
  data['flavor_texts'] = flavor_texts
  data['evolution_chains'] = evolution_chains

  
  # print(json.dumps(data, ensure_ascii=False))

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

def get_form_infos(soup, names):
  infos = []
  info_table_list = soup.select('table.roundy.a-r.at-c')

  for index, form in enumerate(info_table_list):
    if index < len(names):
      form_info = {
        "name": names[index]
      }
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
          ability_el = td.select('td')
          abilities = []
          for el in ability_el:
            name = el.select('a')[0].text.strip()
            is_hidden = True if el.select('small') else False
            abilities.append({
              'name': name,
              'is_hidden': is_hidden
            })
          form_info['ability'] = abilities
        
        # experience
        experience_a = td.find('a', attrs={'title': '经验值'})
        if experience_a:
          experience_el = td.select('td > table')

          for el in experience_el:
            exp = el.select('td')[0].contents[0].text.strip()
            speed = el.select('small')[0].text.strip().replace('（', '').replace('）', '')
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

      infos.append(form_info)
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
    tr_cn = tr.find_all(string=lambda text: '任天堂' in text if text else False)
    tr_en = tr.find_all(string=lambda text: '英文' in text if text else False)
    tr_fr = tr.find_all(string=lambda text: '英文' in text if text else False)
    tr_es = tr.find_all(string=lambda text: '西班牙文' in text if text else False)
    tr_it = tr.find_all(string=lambda text: '意大利文' in text if text else False)
    tr_de = tr.find_all(string=lambda text: '德文' in text if text else False)

    if tr_cn:
      name_zh_hant = tr.select('td')[2].contents[0].strip()
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
  name_ko = name_table.find('span', attrs={'lang': 'ko'}).text.strip()
  names['ko'] = name_ko
  return names

def get_profile(soup):
  profile_p = soup.find('span', id='概述').parent.find_next_sibling()
  profile_text = ''
  while profile_p and profile_p.name == 'p':
    for sup in profile_p.find_all('sup'):
      sup.decompose()

    profile_text += profile_p.get_text()
    profile_p = profile_p.find_next_sibling()
  return profile_text

def get_flavor_texts(soup):
  texts = []
  flavor_table = soup.find('span', id='图鉴介绍').parent.find_next_sibling()
  generation_th_list = flavor_table.select('th.roundytop-5')

  for th in generation_th_list:
    generation = {
      'name': th.text.strip(),
    }
    tr = th.find_parent('tr')
    text_table_list = tr.find_next_sibling().find_all('table')
    version_groups = []
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

            if "{{{" in text or "}}}" in text:
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
  # has_multiple_forms = False
  evo_tag = soup.find('span', id=lambda x: x in ['进化', '進化'])
  if not evo_tag:
    return [{'name': name, 'stage': '不进化', "text": None, "back_text": None, "from": None}]
  tag_h1 = evo_tag.parent

  multi_form_table = tag_h1.find_next('table', class_='a-c')
  single_form_table = tag_h1.find_next('table')

  evolution_table = multi_form_table if multi_form_table else single_form_table

  has_multiple_forms(evolution_table)

  tr_list = evolution_table.find('tbody').find_all('tr', recursive=False, class_=lambda x: x != 'hide')
  form_tr_list = split_form_tr_list(tr_list) if has_multiple_forms(evolution_table) else [tr_list]
  chains = []

  # print(33334333, multi_form_table, len(form_tr_list))
  for tr_list in form_tr_list:
    chain = get_single_evolution_chain(tr_list)
    chains.append(chain)

  return chains

def get_single_evolution_chain(tr_list):
  all_td_list = []
  def get_pokemon(td):
    name_el = td.select('table tbody tr .textblack')[0].find('a')
    name = name_el.text
    form_name = td.find('a', {
      'title': '地区形态'
    })
    # if form_name:
    #   name = name + '-' + form_name.text
    
    stage_el = name_el.parent.parent.find_previous('tr').find('small')
    stage = stage_el.text
    return {"name": name, "stage": stage, "form_name": form_name.text if form_name else None}

  for tr in tr_list:
    td_list = tr.find_all('td', recursive=False)
    for td in td_list:
      all_td_list.append(td)

  nodes = []
  for index, td in enumerate(all_td_list):
    node = {
      'name': None,
      'stage': None,
      'text': None,
      'back_text': None,
      'from': None,
      # 'next_to': None
    }
    if index == 0:
      res = get_pokemon(td)
      node['name'] = res['name']
      node ['form_name'] = res['form_name']
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
    # print(9999999, td)
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

get_data('海地鼠')


# 测试： 皮卡丘，呆呆兽，小拳石，九尾，宝宝丁，阿尔宙斯