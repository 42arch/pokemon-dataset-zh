import math
from bs4 import BeautifulSoup
import requests
from utils import save_image

TOTAL_PAGE = math.floor(1371 / 200) + 1
URL = 'https://wiki.52poke.com/index.php?title=Category:宝可梦版权绘'
PATH = './../data/image/dream/'

page = 1

def get_name(el):
  return el.find('div', class_="gallerytext").find('a').text.strip().replace(' ', '_')

def get_all(last_item):
  full_url = URL if last_item is None else f'{URL}&filefrom={last_item}'
  response = requests.get(full_url)
  response.raise_for_status()
  soup = BeautifulSoup(response.text, "html.parser")

  one_page_ul = soup.find('ul', class_="gallery")
  image_li_list = one_page_ul.find_all('li', class_="gallerybox")
  for el in image_li_list:
    name = get_name(el)
    image_url = el.find('div', class_='thumb').find('img').get('data-url')
    print(name)
    save_image(f'{PATH}{name}', f'https:{image_url}')

  global page
  print(page)
  if page < TOTAL_PAGE:
    page = page + 1
    last_li = image_li_list[len(image_li_list) - 1]
    name = get_name(last_li)
    get_all(name)

if __name__ == '__main__':
  get_all(None)