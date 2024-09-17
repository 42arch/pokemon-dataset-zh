# 宝可梦中文数据集

> 最全最详细的中文宝可梦图鉴数据集，截至目前，收录了第一世代到第九世代所有的宝可梦中文信息。数据抓取自[神奇宝贝百科](https://wiki.52poke.com/wiki/主页)。

## 数据说明

### 宝可梦数据

- data/pokemon_list.json

  按照全国图鉴编号顺序排列的宝可梦列表

- data/pokemon/\*\*.json

  各宝可梦的详细信息

  ```json
  {
    "name": "", // 名称
    "profile": "", // 简介
    "forms": [
      // 形态信息集合
      {
        "name": "", // 形态名称
        "index": "", // 图鉴编号
        "is_mega": false, // 是否为Mega形态
        "is_gmax": false, // 是否为极巨化形态
        "image": "", // 官方绘图，对应 data/image/official/ 中的图片
        "types": [
          // 属性
          ""
        ],
        "genus": "", // 分类
        "ability": [
          // 特性
          {
            "name": "", // 特性名称
            "is_hidden": false // 是否为隐藏属性
          }
          //...
        ],
        "experience": {
          // 经验值
          "number": "", // 100级时的经验值
          "speed": "" // 经验速度
        },
        "height": "", // 身高
        "weight": "", // 体重
        "gender_rate": {
          // 性别比例
          "male": "",
          "female": ""
        },
        "shape": "", // 体型
        "color": "", // 图鉴颜色
        "catch_rate": {
          // 捕获率
          "number": "",
          "rate": ""
        },
        "egg_groups": [""] // 蛋群
      }
    ],
    "stats": [
      // 不同形态的种族值
      {
        "form": "", // 形态名称，默认为一般
        "data": {
          "hp": "", // hp
          "attack": "", // 攻击
          "defense": "", // 防御
          "sp_attack": "", // 特攻
          "sp_defense": "" // 特防
        }
      }
    ],
    "flavor_texts": [
      // 图鉴介绍 按世代
      {
        "name": "", // 世代名称
        "versions": [
          // 各版本
          {
            "name": "", // 版本名称
            "group": "", // 版本组名
            "text": "" // 图鉴介绍文字
          }
          // ...
        ]
      }
    ],
    "evolution_chains": [
      // 进化链信息（多条）
      [
        {
          "name": "", // 宝可梦名称
          "stage": "", // 进化阶段
          "text": "", // 进化条件说明文字
          "image": "", // 图片，对应 data/images/dream/ 中的图片
          "back_text": "", // 退化说明文字
          "from": "", // 进化自
          "form_name": "" // 形态名称
        }
        // ...
      ]
    ],
    "names": {
      // 各语言的名称
      "zh_hans": "", // 简体中文
      "zh_hant": "", // 繁体中文
      "en": "", // 英文
      "fr": "", // 法文
      "de": "", // 德文
      "it": "", // 意大利文
      "es": "", // 西班牙文
      "ja": "", // 日文
      "ko": "" // 韩文
    },
    "moves": {
      // 招式（第九世代）
      "learned": [
        // 各形态可以学习的招式
        {
          "form": "", // 形态名称，默认为一般
          "data": [
            // 招式数据
            {
              "level_learned_at": "", // 可学习的等级
              "machine_used": "", // 使用的招式学习器
              "method": "", // 学习方式
              "name": "", // 招式名称
              "flavor_text": "", // 招式介绍
              "type": "", // 招式属性
              "category": "", // 招式分类
              "power": "", // 威力
              "accuracy": "", // 命中
              "pp": "" // pp
            }
            // ...
          ]
        }
      ],
      "machine": [
        // 各形态可以用招式学习器学习的招式，字段同上
        // ...
      ]
    },
    "home_images": [
      // Pokemon Home 中的形象图片
      {
        "name": "", // 名称（-形态名）
        "image": "", // 普通形态的图片，对应 data/image/home/ 中的图片
        "shiny": "" // 闪光形态下的图片
      }
      // ...
    ]
  }
  ```

- dat/images

  official: 宝可梦的官方形象绘图；

  dream: 宝可梦的版权绘图；

  home: Pokemon Home 中的形象绘图
