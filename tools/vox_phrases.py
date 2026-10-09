"""Банк фраз для адлибов «Пульса»: категории × английский и русский.

Каждая фраза потом озвучивается несколькими голосами (tools/render_vox.py).
Фразы собираются из шаблонов, поэтому их сотни; повторы убираются.
"""
import itertools

CATS = {
    'hype': 'Заводилы',
    'body': 'Двигайся',
    'sound': 'Про звук',
    'deep': 'Тёмные',
    'shout': 'Выкрики',
    'count': 'Счёт',
    'house': 'Хаус',
}


def combos(*parts):
    """Все сочетания частей: combos(['a ', 'b '], ['x', 'y']) → a x, a y, b x, b y."""
    return [''.join(p).strip() for p in itertools.product(*parts)]


EN = {
    'hype': [
        "Let's go!", "Come on!", "Make some noise!", "Hands up!", "Put your hands up!", "Hands in the air!",
        "Everybody!", "Everybody, come on!", "Are you ready?", "Are you ready for this?", "Here we go!",
        "Here we go again!", "Let me hear you!", "Louder!", "I can't hear you!", "Jump!", "Jump, jump, jump!",
        "Get up!", "Get loud!", "Turn it up!", "Turn it up, turn it up!", "One more time!", "Again!",
        "Don't stop!", "Keep it going!", "Keep on moving!", "Go!", "Go, go, go!", "Let's get it!",
        "We're not done yet!", "Lose your mind!", "Lose control!", "All night long!", "Till the morning!",
        "Who's ready?", "Say yeah!", "Say hey!", "Scream!", "Bounce!", "Faster!", "Harder!", "Higher!",
        "Bring it back!", "Run it back!", "Rewind!", "Pull up!", "Drop it!", "Drop it down!", "Here it comes!",
        "Watch this!", "Check this out!", "Check it!", "Listen!", "Listen up!", "Feel it!", "Wake up!",
        "No sleep tonight!", "Party people!", "Ravers!", "Big up!", "Massive!", "Respect!", "Let it go!",
        "Don't hold back!", "Give me more!", "More!", "Push it!", "Push it to the limit!", "Fire!",
        "Light it up!", "Set it off!", "Shut it down!", "Tear it up!", "Burn it down!", "Rock the house!",
        "Let's ride!", "Let's fly!", "Take off!", "Blast off!", "Full power!", "Maximum!", "Unstoppable!",
    ] + combos(['Everybody '], ['jump!', 'dance!', 'move!', 'scream!', 'clap!', 'get up!', 'get down!', 'sing!', 'bounce!', 'go!'])
      + combos(['Let me see your '], ['hands!', 'hands up!', 'feet!', 'moves!'])
      + combos(['Make it '], ['loud!', 'louder!', 'bounce!', 'hot!', 'rain!', 'shake!'])
      + combos(['Turn the ', 'Crank the ', 'Pump the '], ['bass up!', 'volume up!', 'music up!', 'lights down!'])
      + combos(["Let's "], ['dance!', 'move!', 'rave!', 'jump!', 'get down!', 'go deeper!', 'go higher!', 'go crazy!', 'party!', 'get wild!']),
    'body': combos(['Move your ', 'Shake your ', 'Work your ', 'Jack your ', 'Free your ', 'Use your ', 'Feel your '],
                   ['body', 'body!', 'feet', 'hips', 'mind', 'soul'])
      + [
        "Move!", "Move it!", "Move it, move it!", "Shake it!", "Shake it, shake it!", "Work it!", "Work!",
        "Jack!", "Dance!", "Dance, dance, dance!", "Get down!", "Get on the floor!", "On the dance floor!",
        "Everybody on the floor!", "Don't stop moving!", "Keep moving!", "Body!", "Body, body!", "Groove!",
        "Get into the groove!", "Get in the groove!", "Feel the groove!", "Ride the rhythm!", "Swing it!",
        "Step!", "Stomp!", "Stomp your feet!", "Clap your hands!", "Clap!", "Wave your hands!",
        "Hands to the sky!", "Side to side!", "Up and down!", "Left, right!", "Left, right, left!",
        "Back it up!", "Bend it!", "Twist!", "Spin!", "Spin around!", "Lean back!", "Head down!",
        "Nod your head!", "Rock your body!", "Rock it!", "Pop it!", "Lock it!", "Drop low!",
        "Sweat!", "Make it sweat!", "Feel the heat!", "Burn!", "Body to body!", "Hip to hip!",
        "Bodies in motion!", "Move like that!", "Like that!", "Just like that!", "That's it!", "Yeah, like that!",
      ],
    'sound': combos(['Feel the ', 'Hear the ', 'Follow the ', 'Ride the ', 'Lock into the '],
                    ['bass', 'beat', 'kick', 'rhythm', 'groove', 'sound', 'music', 'drums', 'vibe'])
      + combos(['Bass', 'Kick', 'Drums', 'Beat', 'Acid', 'Techno', 'Rave', 'Music', 'Sound', 'Rhythm'], ['!', '.'])
      + combos(['This is '], ['techno', 'acid', 'house', 'rave', 'the underground', 'the sound', 'the future', 'the night', 'the warehouse', 'the beat', 'how we do it', 'our time'])
      + combos(['Welcome to the '], ['underground', 'warehouse', 'rave', 'club', 'future', 'machine', 'basement', 'party', 'night'])
      + [
        "Techno music!", "Acid house!", "Acid!", "Acid, acid!", "Three oh three!", "Nine oh nine!", "Eight oh eight!",
        "Drop the bass!", "Bass drop!", "Here comes the bass!", "Bring the bass!", "More bass!", "Low end!",
        "Kick drum!", "Four to the floor!", "Rave on!", "Raving!", "Underground!", "Warehouse!",
        "Sound system!", "Big sound!", "Loud music!", "The beat goes on!", "Feel the beat!", "Beat drop!",
        "Pump up the volume!", "Pump up the bass!", "Turn up the bass!", "Volume!", "Frequency!", "Sub bass!",
        "Analog!", "Machine music!", "Drum machine!", "Synthesizer!", "Squelch!", "Filter!", "Hi-hats!",
        "Speakers!", "In the club!", "In the mix!", "On the decks!", "DJ!", "Mister DJ!", "Selector!",
        "Rewind, selector!", "Original sound!", "Original!", "Detroit!", "Berlin!", "Chicago!", "Ibiza!",
      ],
    'deep': [
        "Deeper.", "Go deeper.", "Deeper and deeper.", "Dark.", "In the dark.", "Into the dark.", "Darkness.",
        "Close your eyes.", "Don't look back.", "Let go.", "Let it take you.", "Surrender.", "Trance.",
        "Hypnotic.", "Lose yourself.", "Lost.", "Lost in the music.", "Lost in sound.", "Breathe.",
        "Breathe in.", "Breathe out.", "Slowly.", "Calm.", "Silence.", "Shhh.", "Listen.", "Can you hear it?",
        "It's coming.", "Something's coming.", "Wait for it.", "Not yet.", "Almost.", "Now.", "Right now.",
        "Inside.", "Inside the machine.", "Machine.", "We are the machine.", "System.", "System overload.",
        "Signal.", "No signal.", "Transmission.", "Control.", "Out of control.", "No control.", "Obey.",
        "Repeat.", "Repeat after me.", "Again and again.", "Forever.", "Infinity.", "Gravity.", "Void.",
        "Underground.", "Below.", "Down below.", "Nightfall.", "After hours.", "Four AM.", "Midnight.",
        "Ghost.", "Shadow.", "Shadows.", "Fear.", "No fear.", "Pressure.", "Heavy.", "Cold.", "Steel.",
        "Concrete.", "Industrial.", "Hypnosis.", "Dream.", "Dreaming.", "Wake up.", "Are you awake?",
        "Who are you?", "Where are you?", "Follow me.", "Come with me.", "Stay with me.", "Don't leave.",
        "Pulse.", "Heartbeat.", "Feel your heartbeat.", "Body and soul.", "Mind and body.", "Euphoria.",
        "Hold on.", "Hold on tight.", "Falling.", "Rising.", "Higher and higher.", "Elevate.", "Ascend.",
    ] + combos(['Feel the '], ['darkness.', 'silence.', 'pressure.', 'pulse.', 'energy.', 'frequency.', 'vibration.', 'machine.'])
      + combos(['Lost in the '], ['dark.', 'night.', 'fog.', 'lights.', 'crowd.', 'rhythm.', 'machine.']),
    'shout': [
        "Yeah!", "Yeah, yeah!", "Oh yeah!", "Hey!", "Hey, hey!", "Ho!", "Ha!", "Haha!", "Uh!", "Uh, uh!",
        "Oh!", "Ooh!", "Ow!", "Whoo!", "Woo!", "Wow!", "Yo!", "Yo, yo!", "Ayy!", "Aah!", "Ahh!", "Huh!",
        "Hah!", "What!", "What?", "Okay!", "Alright!", "Alright, alright!", "Right!", "Yes!", "Yes, yes!",
        "Yes sir!", "No!", "Stop!", "Wait!", "Boom!", "Bang!", "Pow!", "Bam!", "Zap!", "Whoa!", "Damn!",
        "Sick!", "Crazy!", "Nice!", "Fresh!", "Wicked!", "Dope!", "Hot!", "Wild!", "Ooh, wee!", "Ooh la la!",
        "Uh huh!", "Mm hmm!", "Ohh!", "Eh!", "Hup!", "Hoo!", "Hooo!", "Yah!", "Yeehaw!", "Bingo!", "Woop!",
        "Woop woop!", "Get it!", "Got it!", "Do it!", "Hit it!", "Kill it!", "Own it!", "Shout!", "Uh, yeah!",
        "Ooh, yeah!", "Hey, yeah!", "Yeah, baby!", "Oh my god!", "No way!", "Let's go, baby!", "Come on, baby!",
    ],
    'count': [
        "One, two, three, four!", "One, two!", "One, two, three!", "Five, four, three, two, one!",
        "Three, two, one!", "Ten, nine, eight, seven, six, five, four, three, two, one!", "One!", "Two!",
        "Three!", "Four!", "One more!", "Two more!", "Count it!", "Countdown!", "On the one!", "Ready, set, go!",
        "Ready? Go!", "Ready, steady, go!", "Get ready!", "Get set!", "Here it comes, three, two, one!",
        "One, two, three, jump!", "One, two, three, drop!", "Check, one, two!", "Mic check!", "Mic check, one, two!",
        "Testing, testing!", "Testing, one, two, three!", "Step one!", "Phase one!", "Level up!", "Next level!",
    ],
    'house': [
        "Can you feel it?", "Can you feel it!", "House music!", "House!", "In the house!", "Jack your body!",
        "Everybody dance now!", "Feel the love!", "Love!", "Freedom!", "Feel free!", "Set yourself free!",
        "Music is the answer!", "Music makes you lose control!", "The music!", "Let the music play!",
        "Let the music take control!", "Let the music move you!", "Dance with me!", "Dance all night!",
        "Celebrate!", "Good times!", "Feel good!", "Feeling good!", "So good!", "Sweet!", "Beautiful!",
        "Spread love!", "One love!", "Together!", "All together now!", "We are family!", "Come together!",
        "Gotta have house!", "House nation!", "In the beginning, there was jack!", "Deep house!", "Soulful!",
        "Gimme that groove!", "Gimme some more!", "Uh, house music!", "Don't you want me?", "I need you!",
        "You got it!", "You got to feel it!", "It's alright!", "Everything's gonna be alright!", "Oh, baby!",
        "Sing it!", "Sing it with me!", "Testify!", "Say it loud!", "Higher love!", "Shine!", "Sunshine!",
        "Summer!", "Saturday night!", "Friday night!", "Tonight!", "Every night!", "Paradise!", "Heaven!",
        "Take me higher!", "Take me there!", "Bring me up!", "Lift me up!", "Hold me!", "Don't let go!",
    ] + combos(['Can you feel the '], ['love?', 'music?', 'bass?', 'beat?', 'groove?', 'heat?', 'rhythm?', 'vibe?']),
}

RU = {
    'hype': [
        "Давай!", "Давай, давай!", "Погнали!", "Поехали!", "Вперёд!", "Руки вверх!", "Все руки вверх!",
        "Громче!", "Ещё громче!", "Не слышу!", "Шумим!", "Шуми!", "Прыгай!", "Прыгаем!", "Все прыгаем!",
        "Жги!", "Жжём!", "Огонь!", "Ещё!", "Ещё раз!", "Ещё разок!", "Не останавливайся!", "Не стоп!",
        "Без остановки!", "До утра!", "Всю ночь!", "Готовы?", "Вы готовы?", "Кто готов?", "Вот так!",
        "Вот это да!", "Взрываем!", "Разносим!", "Качаем!", "Качай!", "Качает!", "Заводи!", "Заводим!",
        "Врубай!", "Врубай громче!", "Сделай громче!", "Жми!", "Дави!", "Газу!", "Полный газ!", "На полную!",
        "Мощно!", "Мощнее!", "Сильнее!", "Быстрее!", "Выше!", "Сносим крышу!", "Все вместе!", "Вместе!",
        "Кричи!", "Кричим!", "Хлопаем!", "Хлопай!", "Поднимай!", "Подняли!", "Отпускай!", "Отрываемся!",
        "Улетаем!", "Взлетаем!", "Держись!", "Держитесь!", "Здесь и сейчас!", "Это только начало!",
    ],
    'body': [
        "Двигайся!", "Двигайтесь!", "Двигай телом!", "Танцуй!", "Танцуем!", "Все танцуем!", "Танцуй до утра!",
        "Качай головой!", "Кивай!", "Тряси!", "Двигай бёдрами!", "Шевелись!", "Не стой!", "Не стой на месте!",
        "На танцпол!", "Все на танцпол!", "Тело!", "Двигай!", "Двигай ногами!", "Топай!", "Топаем!",
        "Хлопай в ладоши!", "Влево, вправо!", "Вверх, вниз!", "Крутись!", "Отпусти себя!", "Почувствуй тело!",
        "Почувствуй ритм!", "Лови ритм!", "Лови волну!", "В ритме!", "В такт!", "Под бит!", "Вот так двигайся!",
        "Ниже!", "Ещё ниже!", "Вот это движ!", "Движ!", "Движение!", "Гори!", "Пот!", "Жара!",
    ],
    'sound': [
        "Бас!", "Больше баса!", "Дай баса!", "Ловите бас!", "Слышишь бас?", "Бочка!", "Бит!", "Техно!",
        "Это техно!", "Чистое техно!", "Кислота!", "Эсид!", "Рейв!", "Это рейв!", "Андеграунд!", "Подвал!",
        "Склад!", "Звук!", "Какой звук!", "Громкость!", "Частоты!", "Низы!", "Дай низов!", "Колонки!",
        "Рвём колонки!", "Ди-джей!", "Эй, ди-джей!", "Музыка!", "Эта музыка!", "Ритм!", "Пульс!", "Грув!",
        "Машина!", "Драм-машина!", "Синтезатор!", "Фильтр!", "Дроп!", "Сейчас будет дроп!", "Вот он, дроп!",
        "Добро пожаловать в андеграунд!", "Добро пожаловать на рейв!", "Это наш звук!", "Чувствуешь бит?",
        "Чувствуешь бас?", "Чувствуешь ритм?", "Слушай!", "Слышишь?", "Вот это звук!",
    ],
    'deep': [
        "Глубже.", "Ещё глубже.", "Темнота.", "В темноте.", "Закрой глаза.", "Дыши.", "Вдох.", "Выдох.",
        "Тише.", "Тишина.", "Слушай.", "Слышишь?", "Не оглядывайся.", "Отпусти.", "Растворись.", "Потеряйся.",
        "Потерян.", "Транс.", "Гипноз.", "Спи.", "Проснись.", "Ты здесь?", "Где ты?", "Кто ты?", "Иди за мной.",
        "Останься.", "Не уходи.", "Ближе.", "Ещё ближе.", "Медленно.", "Скоро.", "Почти.", "Сейчас.",
        "Ещё не время.", "Жди.", "Оно идёт.", "Внутри.", "Внутри машины.", "Система.", "Сигнал.", "Нет сигнала.",
        "Контроль.", "Без контроля.", "Повторяй.", "Снова и снова.", "Навсегда.", "Бесконечность.", "Пустота.",
        "Ночь.", "Полночь.", "Четыре утра.", "Тень.", "Холод.", "Сталь.", "Бетон.", "Давление.", "Тяжело.",
        "Сердце.", "Сердцебиение.", "Чувствуешь?", "Падаем.", "Поднимаемся.", "Выше и выше.", "Сон.",
    ],
    'shout': [
        "Эй!", "Эй, эй!", "Ха!", "Хей!", "Йо!", "Оу!", "Уу!", "Ууу!", "Ах!", "Ох!", "Ого!", "Опа!", "Оп!",
        "Оп-оп!", "Хоп!", "Хоп-хоп!", "Вау!", "Да!", "Да, да!", "О да!", "Ага!", "Угу!", "Нет!", "Стоп!",
        "Бум!", "Бах!", "Бах-бах!", "Ну!", "Ну давай!", "Ну же!", "Вот!", "Вот так!", "Красиво!", "Круто!",
        "Жесть!", "Пушка!", "Бомба!", "Улёт!", "Кайф!", "Вот это кайф!", "Ура!", "Эге-гей!", "Алло!",
        "Ну ничего себе!", "Ох, ничего себе!", "Ой!", "Йоу!", "Чё!", "Вот это да!",
    ],
    'count': [
        "Раз, два, три, четыре!", "Раз, два!", "Раз, два, три!", "Три, два, один!", "Пять, четыре, три, два, один!",
        "Раз!", "Два!", "Три!", "Четыре!", "Ещё раз!", "Отсчёт!", "На старт, внимание, марш!", "Приготовились!",
        "Раз, два, три, прыгаем!", "Раз, два, три, поехали!", "Проверка, раз, два!", "Микрофон, раз, два!",
        "Внимание!", "Готовьтесь!", "Новый уровень!", "Следующий уровень!",
    ],
    'house': [
        "Чувствуешь?", "Чувствуешь любовь?", "Хаус!", "Хаус-музыка!", "Любовь!", "Свобода!", "Будь свободным!",
        "Музыка — это ответ!", "Пусть играет музыка!", "Музыка ведёт!", "Танцуй со мной!", "Танцуем всю ночь!",
        "Хорошо!", "Как хорошо!", "Красота!", "Вместе!", "Все вместе!", "Мы одна семья!", "Пой!", "Пой со мной!",
        "Выше!", "Возьми меня выше!", "Подними меня!", "Не отпускай!", "Всё будет хорошо!", "Солнце!", "Лето!",
        "Субботний вечер!", "Пятница!", "Сегодня!", "Каждую ночь!", "Рай!", "Небеса!", "Свети!", "Улыбнись!",
    ],
}


def phrases():
    out, seen = [], set()
    for lang, bank in (('en', EN), ('ru', RU)):
        for cat, items in bank.items():
            for t in items:
                key = (lang, t.lower().strip('!?. '))
                if key in seen:
                    continue
                seen.add(key)
                out.append({'text': t, 'cat': cat, 'lang': lang})
    return out


if __name__ == '__main__':
    ps = phrases()
    from collections import Counter
    print(len(ps), Counter((p['lang'], p['cat']) for p in ps))
