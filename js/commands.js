// Разбор русских голосовых команд в список действий.
// Работает по корням слов, поэтому понимает «бочку», «бочка», «бочки», «хэты», «хай-хэт» и т. п.
import { VARIANTS } from './music.js?v=5';
import { KIT_WORDS, SOUND_WORDS } from './sounds.js?v=5';

const B = '(?<![а-яa-z0-9])';
const rx = s => new RegExp(B + '(?:' + s + ')');
const rxg = s => new RegExp(B + '(?:' + s + ')', 'g');

const NUM = {
  ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200,
};
const mag = v => (v >= 100 ? 3 : v >= 20 ? 2 : v >= 10 ? 1.5 : 1);

function wordsToNumbers(s) {
  const t = s.split(' '), out = [];
  for (let i = 0; i < t.length; i++) {
    if (!(t[i] in NUM)) { out.push(t[i]); continue; }
    let v = NUM[t[i]], m = mag(v);
    while (i + 1 < t.length && t[i + 1] in NUM) {
      const nv = NUM[t[i + 1]], nm = mag(nv);
      if (m <= 1.5 || nm >= m) break;
      v += nv; m = nm; i++;
    }
    out.push(String(v));
  }
  return out.join(' ');
}

export function normalize(text) {
  let s = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/э/g, 'е');
  s = s.replace(/[-–—_/\\+]/g, ' ').replace(/[.;:!?…]/g, ' , ').replace(/,/g, ' , ');
  s = s.replace(/[^а-яa-z0-9#, ]/g, ' ').replace(/\s+/g, ' ').trim();
  return wordsToNumbers(s);
}

// Короткие команды, которые выполняются сразу, ещё до конца фразы.
export const QUICK = new Set(['стоп', 'дроп', 'брейк', 'поехали', 'старт', 'плей', 'погнали', 'нарастание']);

const INSTR = [
  ['kick', 'бочк|бочен|бочок|кик|kick|бас ?барабан'],
  ['ohat', 'открыт\\S* ?(?:хет|хай ?хет|хай ?хат|тарелк)|опен ?хет|open ?hat|оупен'],
  ['hat', 'хай ?хет|хай ?хат|хайхет|хет|хат(?:ы|ов|ик)|тарелк|шейкер|hi ?hat|hat|хетик'],
  ['clap', 'клеп|клап|хлоп|снеер|снейр|снер|малы[йм] барабан|рабоч|clap|snare'],
  ['perc', 'перк|бонг|конг|томы|томов|ковбел|percussion|perc'],
  ['bass', 'бас(?! ?барабан)|bass|303'],
  ['stab', 'стаб|стеб|аккорд|акорд|chord|stab|клавиш'],
  ['lead', 'мелоди(?!к|чн)|лид(?![а-я])|лида|лиду|синт|арп|lead|melody'],
  ['vox', 'голос(?!ом)|вокал|адлиб|ад ?либ|ед ?либ|ad ?lib|выкрик|войс ?тег|войстег|фраз[аыу]?(?![а-я])|фразами|фразочк|диктор|эмси|мс(?![а-я])|кричалк'],
  ['rumble', 'рамбл|румбл|рокот|гул(?![а-я])|гула|гулом|rumble'],
  ['drums', 'барабан|ударн|драм|drums|ударку|ритм(?![а-я])|ритм секц'],
].map(([id, s]) => [id, rx(s), rxg(s)]);

const VARIANT_RX = {
  kick: [['trap', 'треп|трап|trap|халфтайм|half ?time'], ['four', 'ровн|прям|4 4|на каждую долю|каждую долю|четверт|классич|обычн|на пол'], ['broken', 'ломан|брейкбит|сбит|синкоп|рван|криво|ломк'], ['half', 'половин|редк|реже|халф|half|через долю'], ['gallop', 'галоп|двойн|скач']],
  clap: [['slow', 'на 3(?![0-9])|на третью|халфтайм|треп|трап'], ['every', 'на каждую|каждую долю|все доли'], ['sync', 'синкоп|ломан|сбит|криво|смещ'], ['sparse', 'редк|раз в такт'], ['back', '2 4|бекбит|backbeat|ровн|обычн|классич']],
  hat: [['trap', 'треп|трап|trap|роллы|дробью'], ['six', 'шестнадцат|частые|частую|частый|часто|быстр|16|мелк|дробь|трель'], ['eight', 'восьм|8(?![0-9])'], ['gallop', 'галоп|скач'], ['sparse', 'редк|реже'], ['off', 'офбит|оффбит|оф бит|off ?beat|между|слаб|промежут|посередин|ровн|обычн|классич']],
  ohat: [['sparse', 'редк|реже|иногда'], ['off', 'офбит|оффбит|между|слаб|ровн|обычн']],
  perc: [['three', 'тройк|3(?![0-9])|гипно|триол'], ['sparse', 'редк|реже|немного|чуть'], ['sync', 'синкоп|ломан|афро|латин|сбит']],
  bass: [['808', '808|треп|трап|trap|гудящ'], ['acid', 'кислот|есид|асид|acid|303|визж|квак|резонанс'], ['deep', 'глубок|дип|deep|саб|низк|мягк|бархат|тепл'], ['offbeat', 'офбит|между долями|простой|прост'], ['rolling', 'катящ|катит|роллинг|rolling|ровн|шестнадцат|быстр|бегущ|галоп|драйв']],
  stab: [['pad', 'пед(?![а-я])|пад(?![а-я])|pad|подложк|мрачн|тягуч'], ['chords', 'ритмичн|быстр|част|детройт|хаус'], ['sparse', 'редк|реже|раз в такт'], ['dub', 'даб|dub|ех[оа](?![а-я])|глубок|космич']],
  lead: [['slow', 'мрачн|жутк|призрач|медленн'], ['melody', 'мелоди|напев|тем[ау](?![а-я])|риф'], ['arp', 'арп|арпедж|бегущ|перебор']],
  vox: [['shouts', 'выкрик|крик'], ['chop', 'нарез|чоп|chop|рубл|по слогам'], ['count', 'отсчет|счет|считалк'], ['dark', 'темн|мрачн|шепот|глубок|гипно'],
    ['soul', 'хаус|соул|душев'], ['move', 'двига|танц|про тело'], ['talk', 'про звук|про бас|про техно'], ['hype', 'завод|кричалк|призыв'], ['mix', 'микс|разн|всякие']],
};
for (const id in VARIANT_RX) VARIANT_RX[id] = VARIANT_RX[id].map(([v, s]) => [v, rx(s)]);

const GENRE_RX = [
  ['witch', 'ви?т?ч ?хаус|уич ?хаус|witch|ведьм|вичхаус|витчхаус'],
  ['house', 'дип ?хаус|хаус|house|хауз'],
  ['acid', 'есид|асид|acid|кислотн(?:ое|ую|ого|ый) техно|кислотное|кислотняк'],
  ['minimal', 'минимал|minimal'],
  ['industrial', 'индаст|индуст|industrial'],
  ['dub', 'даб ?техно|дабтехно|dub ?techno|дабов(?:ое|ый|ую) техно|в стиле даб'],
  ['detroit', 'детройт|detroit'],
  ['melodic', 'мелодик|мелодичн(?:ое|ый|ую|ого) техно|melodic'],
  ['hypnotic', 'гипно|hypno'],
  ['hard', 'хард|hard|шранц|шранз|schranz|жестк(?:ое|ий|ую|ого) техно|рейв|rave'],
  ['peak', 'пик ?тайм|peak|берлин|классическ(?:ое|ий|ую) техно|обычн(?:ое|ый|ую) техно'],
].map(([id, s]) => [id, rx(s)]);

const R = Object.fromEntries(Object.entries({
  help: 'помощ|что (?:ты )?умеешь|что можно (?:сказать|говорить)|какие (?:есть )?команды|подскаж|справк|что говорить|help',
  undo: 'отмен|откат|как было|undo',
  reset: 'нов(?:ый|ую|ое) (?:трек|проект|песн)|с нуля|начн(?:и|ем) (?:все )?заново|очисти все|удали все|сотри все|сбрось все|сброс(?![а-я])',
  beatbox: 'битбокс|бит бокс|beat ?box|отбей|отбить|простуч|(?:напою|напеть|напой|спою|запиши|запишу|покажу|наговорю|наговорить) (?:бит|ритм|барабан|ударн|бочк|хет|клеп)',
  hum: 'напою|напеть|напева|напой|напоем|спою|спеть|спой|промыч|помыч|насвист|просвист|голосом|запиши (?:мелод|бас|лид|синт|аккорд|стаб|голос)|запишу (?:мелод|бас)|пропою|подпою',
  recStart: '(?:начни|включи|старт|запусти|начать|давай|начинай|начнем)\\S* ?запис|запиши (?:трек|все|микс|это|музык)|записывай|запись трека',
  recStop: '(?:стоп|останови|закончи|заверши|хватит|выключи|прекрати|сохрани|скачай)\\S* (?:запис|трек|файл)|сохрани|скачай|запись стоп',
  genAny: 'придумай|сочини|сгенерир|сделай|напиши|создай|замути|забацай|удиви|давай|включи|хочу|поставь|запусти|сыграй|покажи',
  compose: 'напиши|сочини|сочиним|напишем|составь|аранжир|собери трек|построй трек',
  songMode: 'весь трек|трек целиком|целиком|полностью|режим трека|полный трек|проиграй трек|играй трек|сыграй трек|включи трек|по частям|с аранжиров',
  loopMode: 'петл|зацикл|режим петли|один такт|только такт|луп(?![а-я])',
  seekStart: 'с начала|в начало|сначала',
  seek: 'перемот|отмот|промот|мотани|перескоч|прыгни|перейди|(?:вперед|назад) на|в конец трека|к концу трека',
  nextTrack: 'следующ\\S* (?:трек|вариант|песн)|дальше трек|листай|перелистн|пролистн|некст|next|не нравится|скип|skip',
  prevTrack: 'предыдущ\\S* (?:трек|вариант|песн)|прошл\\S* (?:трек|вариант)|верни (?:прошл|предыдущ|тот трек|старый трек)|назад к трек|прежн\\S* трек',
  reroll: 'друг(?:ой|ая|ую|ое) (?:вариант|верси|трек|аранжиров)|еще (?:вариант|раз сочини)|пересочини|перепиши трек|новый вариант',
  harm: 'прогресс|гармони|смен\\S* аккорд|аккорд\\S* (?:меня|двига|ход|иду|пошл)|ход\\S* аккорд|круг\\S* аккорд|по аккордам',
  kit: 'набор|кит(?![а-я])|комплект|пресет|звуки|звучани',
  sound: 'звук|тембр|семпл|сампл',
  other: 'друг(?:ой|ую|ие|ое|ая|ого|им)|следующ|смени звук|поменяй звук',
  patWord: 'ритм|рисун|паттерн|парти|линию|линия|ноты|грув|мелоди',
  newW: 'нов(?:ый|ую|ые|ое|ая|ого|ых)|придумай|сочини|сгенерир|случайн|перепиши|переделай',
  also: 'тоже|также|в соло|еще и|плюс',
  genObj: 'трек|техно|бит(?![а-я])|грув|что ?нибудь|что то|музык|луп|рейв',
  build: 'нарастан|подъем|подьем|подними енерг|накал|билд|build|разгон|напряж|разогрей|нагнет|нагрей',
  drop: 'дроп|drop|взрыв|понеслась|бах(?![а-я])|врубай все',
  brk: 'брейк|break|перерыв|передышк|затишь|убери бит',
  metro: 'метроном|клик(?![а-я])|клики',
  unmuteAll: 'верни все|все вместе|все обратно|все инструменты|включи все|сними соло|убери соло|без соло|отмени соло|все играют|пусть все|выключи соло|всех верни',
  tempo: 'темп|бпм|bpm|бит в минуту|ударов в минуту|скорост',
  faster: 'быстрее|ускор|побыстр|быстрей|живее|прибавь темп',
  slower: 'медленн|замедл|помедл|медленней|тормоз|спокойнее|сбавь темп|убавь темп|притормоз',
  key: 'тональност|минор|мажор|фригий|дорий',
  transpose: 'транспон|подними тональн|опусти тональн|тональност\\S* (?:выше|ниже)|сдвинь тональн',
  swing: 'свинг|шафл|шаффл|swing|shuffle|раскач',
  dry: 'сух(?:о|ой|ая|ое|ие)(?![а-я])|без еффект|убери (?:все )?еффект',
  rev: 'реверб|ревер(?!с)|зал(?![а-я])|зала|залом|пространств|обьем|объем|reverb|простор|хол(?:л)?(?![а-я])',
  dly: 'дилей|делей|дилеи|дилея|дилеем|задержк|ех(?:о|а|у|ом)(?![а-я])|delay|отзвук|повторы',
  acidMore: 'кислотнее|кислее|больше кисл|побольше кисл|еще кисл|сильнее кисл|прибавь кисл|резонанс|визг|писк|квак',
  acidLess: 'меньше кисл|поменьше кисл|без кисл|убери кисл|слабее кисл',
  acidW: 'кислот',
  drive: 'перегруз|дисторш|искаж|драйв|грязн|жестч|жестк|агрессив|злее|мощн|овердрайв|фузз|fuzz|сатурац|грязи|жирн',
  soft: 'мягче|чище|нежнее|аккуратнее|без перегруз|меньше перегруз|убери перегруз',
  filt: 'фильтр|filter|ярче|светлее|звонче|темнее|глуше|мутн|под водой|в подушку|открой|закрой|открыть|закрыть|открывай|закрывай',
  open: 'открой|откр(?:ыть|ывай|оем)|ярче|светлее|звонче|фильтр (?:вверх|выше)|подними фильтр|прозрачн',
  close: 'закрой|закр(?:ыть|ывай|оем)|темнее|глуше|мутн|под водой|в подушку|фильтр (?:вниз|ниже)|опусти фильтр|приглуши фильтр',
  masterT: 'на все|весь(?![а-я])|всего|мастер|общ|везде|всю музык|целиком|на всем|все звук|весь трек|всему',
  louder: 'громче|погромче|громко|прибав|усиль|подними(?! тональн| фильтр| енерг| темп)|добавь громк|увеличь громк',
  quieter: 'тише|потише|убавь|приглуш|уменьши громк|понизь громк|тихо|тихонько|опусти(?! тональн| фильтр| темп)',
  longer: 'длинн|длиннее|протяжн|подлинн|тянуч|дольше',
  shorter: 'коротк|короче|покороче|отрывист|резче',
  up: 'выше|повыше|вверх',
  down: 'ниже|пониже|вниз',
  octave: 'октав',
  semi: 'полтон|полутон',
  tone: 'на тон(?![а-я])',
  more: 'чаще|гуще|плотнее|сложнее|больше нот|побольше|больше|еще|активн|насыщенн|быстрее|интенсивн|навали',
  less: 'реже|проще|пореже|поменьше|меньше|спокойн|минимальн|прореди|разреди|упрости|легче',
  lessFx: 'меньше|убав|убер|без(?![а-я])|поменьше|слабее|выключ|отключ|тише|сними|минус|ноль',
  zeroFx: 'без(?![а-я])|убер|выключ|отключ|сними|ноль',
  solo: 'только|соло|оставь(?! все)|отдельно|solo',
  except: 'кроме',
  clear: 'очист|удали|сотри|стер(?:еть|ли)|сбрось|снеси|почисти|clear',
  mute: 'убер|убрать|убираем|выключ|выруб|отключ|без(?![а-я])|заглуш|мьют|mute|хватит|спрячь|не надо|убей|стоп|останов|не нужн|прибери|выкинь|выбрось|долой|убир',
  regen: 'друг(?:ой|ую|ие|ое|ая|ого)|нов(?:ый|ую|ые|ое|ая|ого|ых)|придумай|сочини|сгенерир|случайн|рандом|вариац|поменяй|измени|перемешай|иначе|еще раз|по другому|замени|перепиши|переделай|обнови|смени',
  add: 'добав|давай|дай|сделай|постав|встав|включ|верни|хочу|нужн|пусть|запусти|вруби|накинь|подкинь|кинь|закинь|где|запили|подключ|можно|сыграй|играй|врубай',
  stop: 'стоп|stop|хватит|останов|пауз|стой|замолч|тишин|выключ|выруб|заткн|тормоз|прекрат|конец',
  play: 'старт|плей|play|играй|играть|поехали|погнали|запуст|включ|продолж|давай|го(?![а-я])|вруби|начина|сыграй|жги|качай|поиграй|start',
  step: 'шаг',
  beat: 'дол',
}).map(([k, s]) => [k, rx(s)]));

const NOTE_RU = { до: 0, ре: 2, ми: 4, фа: 5, соль: 7, ля: 9, си: 11 };
const KEY_RX = /(?<![а-я])(до|ре|ми|фа|соль|ля|си)(?: (диез|бемоль))?(?![а-я])/;
const KEY_LAT = /(?<![a-z])([a-g])(#| sharp| flat)?(?:m| minor| major)?(?![a-z])/;

function parseKey(c) {
  let key = null, scale = null;
  const m = c.match(KEY_RX);
  if (m && (R.key.test(c) || /(?<![а-я])(?:в|на|из) (?:до|ре|ми|фа|соль|ля|си)(?![а-я])/.test(c))) {
    key = NOTE_RU[m[1]] + (m[2] === 'диез' ? 1 : m[2] === 'бемоль' ? -1 : 0);
  } else {
    const l = c.match(KEY_LAT);
    if (l && R.key.test(c)) key = 'cdefgab'.indexOf(l[1]) >= 0 ? [0, 2, 4, 5, 7, 9, 11]['cdefgab'.indexOf(l[1])] + (l[2] === '#' || l[2] === ' sharp' ? 1 : l[2] === ' flat' ? -1 : 0) : null;
  }
  if (/минор/.test(c)) scale = 'minor';
  else if (/мажор/.test(c)) scale = 'major';
  else if (/фригий/.test(c)) scale = 'phrygian';
  else if (/дорий/.test(c)) scale = 'dorian';
  if (key == null && !scale) return null;
  return { key: key == null ? null : (key + 12) % 12, scale };
}

function findInstr(c) {
  let w = ' ' + c + ' ';
  const found = [];
  for (const [id, re, reg] of INSTR) {
    const m = w.match(re);
    if (!m) continue;
    found.push({ id, at: m.index });
    w = w.replace(reg, s => ' '.repeat(s.length));
  }
  let ids = found.sort((a, b) => a.at - b.at).map(f => f.id);
  // «ритм хэтов» — это про хэты, а не про все барабаны
  if (ids.length > 1 && ids.includes('drums') && !/барабан|ударн|драм|ударку|drums/.test(c)) ids = ids.filter(i => i !== 'drums');
  return ids;
}

const KITW = KIT_WORDS.map(([id, s]) => [id, rx(s)]);
const SNDW = Object.fromEntries(Object.entries(SOUND_WORDS).map(([k, l]) => [k, l.map(([id, s]) => [id, rx(s)])]));
const findWord = (list, c) => (list.find(([, re]) => re.test(c)) || [])[0] || null;

// Длина трека в минутах, если сказана: «на 3 минуты», «на полторы минуты», «на минуту».
function minutes(c) {
  if (/полтор/.test(c)) return 1.5;
  const m = c.match(/(\d+) ?минут/);
  if (m) return +m[1];
  if (/(?<![а-я])минуту(?![а-я])/.test(c)) return 1;
  if (/пару минут/.test(c)) return 2;
  return null;
}

function variantsFor(ids, c) {
  const out = {};
  for (const id of ids) {
    for (const [v, re] of VARIANT_RX[id] || []) if (re.test(c)) { out[id] = v; break; }
  }
  return out;
}

const firstNum = (nums, lo, hi) => nums.find(n => n >= lo && n <= hi);

function stepsFromNums(c, nums) {
  if (!nums.length) return null;
  if (R.step.test(c)) return nums.filter(n => n >= 1 && n <= 16).map(n => n - 1);
  if (R.beat.test(c) || nums.every(n => n >= 1 && n <= 4)) return nums.filter(n => n >= 1 && n <= 4).map(n => (n - 1) * 4);
  if (nums.every(n => n >= 1 && n <= 16)) return nums.map(n => n - 1);
  return null;
}

// Одна часть фразы → действия (обычно одно).
function parseClause(c) {
  const out = [];
  let I = findInstr(c);
  const hasI = I.length > 0;
  const nums = (c.match(/\d+/g) || []).map(Number);
  const A = (type, o = {}) => ({ type, ...o });

  if (R.help.test(c)) return [A('help')];
  const say = c.match(/(?<![а-я])(?:скажи|крикни|прокричи|произнеси|выкрикни|адлиб|ад либ)\s+(.+)/);
  if (say && !findInstr(say[1]).filter(i => i !== 'vox').length) return [A('voxSay', { q: say[1] })];
  if (R.undo.test(c)) return [A('undo')];
  if (R.beatbox.test(c)) return [A('beatbox')];
  if (R.hum.test(c)) return [A('hum', { track: I.find(i => i === 'bass' || i === 'lead' || i === 'stab') || null })];
  if (R.recStart.test(c)) return [A('recStart')];
  if (R.recStop.test(c) && !hasI) return [A('recStop')];
  if (R.reset.test(c)) return [A('reset')];
  // Гармония: «другая прогрессия», «смена аккордов чаще», «без прогрессии»
  if (R.harm.test(c)) {
    if (R.zeroFx.test(c) || /на месте|одн\S* аккорд/.test(c)) return [A('harm', { prog: 'none' })];
    if (/чаще|быстре|быстрей/.test(c)) return [A('harm', { per: -1 })];
    if (/реже|медленн|дольше/.test(c)) return [A('harm', { per: 1 })];
    return [A('harm')];
  }

  if (!hasI) {
    // Перемотка: «перемотай вперёд», «назад на 8 тактов», «на 30 секунд вперёд», «на 2 минуты», «к дропу»
    if (R.seek.test(c)) {
      if (/начал|сначала/.test(c)) return [A('seek', { bar: 0 })];
      if (/конец|конц/.test(c)) return [A('seek', { end: true })];
      const PARTS = [['drop', 'дроп'], ['break', 'брейк'], ['rise', 'подъем|подьем|нарастан'], ['pit', 'ям[уеа]'], ['main', 'грув'], ['build', 'набор'], ['intro', 'интро'], ['outro', 'аутро'], ['down', 'спад']];
      const part = PARTS.find(([, w]) => new RegExp(w).test(c));
      if (part) return [A('seek', { types: [part[0]] })];
      const dir = /назад|отмот|обратно/.test(c) ? -1 : /вперед|дальше|промот/.test(c) ? 1 : 0;
      const n = firstNum(nums, 1, 600);
      const half = /полминут/.test(c) ? 30 : /полтор/.test(c) ? 90 : null;
      const mm = c.match(/(?:минут\S* (\d+)(?: (\d+))?|(\d+) (\d+)(?![0-9]))/);
      let sec = null;
      if (half) sec = half;
      else if (/секунд/.test(c) && n) sec = n;
      else if (mm && !dir) sec = mm[1] ? +mm[1] * 60 + (+mm[2] || 0) : +mm[3] * 60 + +mm[4];
      else if (/минут/.test(c)) sec = (n || 1) * 60;
      if (sec != null) return [A('seek', dir ? { dsec: dir * sec } : { sec })];
      if (/такт/.test(c) && n) return [A('seek', { delta: (dir || 1) * n })];
      return [A('seek', { delta: (dir || 1) * 16 })];
    }
    // Наборы звуков: «набор витч хаус», «звуки 808»
    if (R.kit.test(c)) {
      const k = findWord(KITW, c);
      if (k) return [A('kit', { id: k })];
    }
    const g = GENRE_RX.find(([, re]) => re.test(c));
    const mins = minutes(c);
    // «другой вариант» — новый номер: свои партии, звуки и аранжировка; «вариант 777» — конкретный вариант
    const vm = c.match(/(?<![а-я])вариант\S* (?:номер )?(\d+)/);
    if (vm) return [...(g ? [A('genre', { id: g[0] })] : []), A('song', { minutes: mins, seed: +vm[1] })];
    if (R.prevTrack.test(c)) return [A('prevTrack')];
    if (R.nextTrack.test(c)) return [A('nextTrack')];
    if (R.reroll.test(c)) return [A('song', { minutes: mins, reroll: true })];
    // Трек целиком: «напиши трек на 3 минуты», «сочини витч хаус», «сделай техно на 4 минуты»
    if (mins || (R.compose.test(c) && (g || R.genObj.test(c)))) {
      const res = g ? [A('genre', { id: g[0] })] : [];
      return [...res, A('song', { minutes: mins })];
    }
    if (R.loopMode.test(c)) return [A('mode', { mode: 'loop' })];
    if (R.songMode.test(c)) return [A('mode', { mode: 'song' })];
    if (R.seekStart.test(c)) return [A('seek', { bar: 0 })];
    if (g) {
      const res = [A('genre', { id: g[0] })];
      const bpm = R.tempo.test(c) && firstNum(nums, 60, 200);
      if (bpm) res.push(A('tempo', { set: bpm }));
      return res;
    }
    if (R.genAny.test(c) && R.genObj.test(c)) return [A('genre', { id: null })];
  }

  if (R.build.test(c)) return [A('build')];
  if (R.brk.test(c)) return [A('break')];
  if (R.drop.test(c)) return [A('drop')];
  if (R.metro.test(c)) return [A('metro', { on: !R.mute.test(c) })];
  if (R.unmuteAll.test(c)) return [A('unmuteAll')];

  // Темп и тональность можно сказать в той же фразе, что и что-то ещё.
  if (R.tempo.test(c)) {
    const n = firstNum(nums, 40, 250);
    if (n && !R.faster.test(c) && !R.slower.test(c)) out.push(A('tempo', { set: n }));
    else if (R.faster.test(c) || R.up.test(c) || /подними|прибав|увелич/.test(c)) out.push(A('tempo', { delta: firstNum(nums, 1, 40) || 4 }));
    else if (R.slower.test(c) || R.down.test(c) || /опусти|убав|уменьш|снизь/.test(c)) out.push(A('tempo', { delta: -(firstNum(nums, 1, 40) || 4) }));
    if (!hasI) return out;
  } else if (!hasI && (R.faster.test(c) || R.slower.test(c))) {
    const d = firstNum(nums, 1, 40) || 4;
    return [A('tempo', { delta: R.slower.test(c) ? -d : d })];
  }

  if (R.transpose.test(c) || (!hasI && (R.up.test(c) || R.down.test(c)) && !R.louder.test(c) && !R.quieter.test(c) && !R.filt.test(c) && !R.key.test(c))) {
    let d = R.octave.test(c) ? 12 : R.tone.test(c) ? 2 : firstNum(nums, 1, 12) || 1;
    if (R.down.test(c) || /опусти/.test(c)) d = -d;
    return [...out, A('transpose', { delta: d })];
  }
  if (R.key.test(c) || /(?<![а-я])(?:в|на) (?:до|ре|ми|фа|соль|ля|си)(?![а-я])/.test(c)) {
    const k = parseKey(c);
    if (k) { out.push(A('key', k)); if (!hasI) return out; }
  }

  if (R.swing.test(c)) {
    const n = firstNum(nums, 1, 60);
    if (R.zeroFx.test(c) || /ровн/.test(c)) return [...out, A('swing', { set: 0 })];
    if (n) return [...out, A('swing', { set: n / 100 })];
    return [...out, A('swing', { delta: R.lessFx.test(c) ? -0.1 : 0.15 })];
  }

  const tgt = hasI ? I[0] : 'master';
  if (R.dry.test(c) && !hasI) return [...out, A('dry')];
  for (const fx of ['rev', 'dly']) {
    if (R[fx].test(c)) {
      const less = R.lessFx.test(c);
      return [...out, A('fx', { fx, track: tgt, dir: less ? -1 : 1, zero: less && R.zeroFx.test(c) })];
    }
  }

  if (R.acidLess.test(c)) return [...out, A('acid', { dir: -1 })];
  if (R.acidMore.test(c) || (R.acidW.test(c) && !I.includes('bass') && (R.more.test(c) || R.add.test(c)))) return [...out, A('acid', { dir: 1 })];

  if (R.drive.test(c)) return [...out, A('drive', { tracks: I, dir: R.lessFx.test(c) ? -1 : 1 })];
  if (R.soft.test(c) && !R.filt.test(c)) return [...out, A('drive', { tracks: I, dir: -1 })];

  if (R.filt.test(c) && (R.open.test(c) || R.close.test(c) || R.up.test(c) || R.down.test(c))) {
    const dir = R.open.test(c) || (R.up.test(c) && !R.close.test(c)) ? 1 : -1;
    return [...out, A('filter', { track: R.masterT.test(c) ? 'master' : hasI ? I[0] : null, dir })];
  }

  if (R.louder.test(c) || R.quieter.test(c)) {
    const d = firstNum(nums, 1, 20) || 3;
    return [...out, A('vol', { tracks: hasI ? I : ['master'], delta: R.quieter.test(c) ? -d : d })];
  }

  if (hasI && (R.longer.test(c) || R.shorter.test(c))) return [...out, A('decay', { tracks: I, dir: R.longer.test(c) ? 1 : -1 })];

  if (hasI && (R.up.test(c) || R.down.test(c) || R.octave.test(c))) {
    let d = R.octave.test(c) ? 12 : R.semi.test(c) ? 1 : R.tone.test(c) ? 2 : firstNum(nums, 1, 24) || null;
    const dir = R.down.test(c) ? -1 : 1;
    return [...out, A('pitch', { tracks: I, delta: d == null ? null : d * dir, dir })];
  }

  // Голос: язык, пол, диктор, обработка, другие фразы
  if (I.length === 1 && I[0] === 'vox') {
    const lang = /русск/.test(c) ? 'ru' : /англ|инглиш|english/.test(c) ? 'en' : /оба язык|обоих язык|смеша/.test(c) ? 'mix' : null;
    if (lang) return [...out, A('voxLang', { lang })];
    const sex = /мужск|мужик|парн|пацан/.test(c) ? 'm' : /женск|девуш|девич|женщин|девчон/.test(c) ? 'f' : null;
    if (sex) return [...out, A('voxVoice', { sex })];
    const fxw = findWord(SNDW.vox, c);
    if (fxw && !R.mute.test(c) && !R.clear.test(c)) return [...out, A('sound', { tracks: ['vox'], name: fxw })];
    const variants = variantsFor(I, c);
    if (R.other.test(c) && /голос|диктор|мс|эмси/.test(c) && !/либ|фраз|выкрик|кричалк/.test(c) && !Object.keys(variants).length) return [...out, A('voxVoice', {})];
    if (R.other.test(c) && !R.solo.test(c)) return [...out, A('regen', { tracks: ['vox'], variants })];
  }

  if (hasI) {
    const variants = variantsFor(I, c);
    // Звуки: «бочка 808», «звук клэпа снейр», «другой хэт»
    const own = I.filter(i => SNDW[i]);
    if (own.length && (R.sound.test(c) || /808|909|303|пиано|пианин|рояль|родес/.test(c))) {
      for (const id of own) {
        const name = findWord(SNDW[id], c.replace(/(?<![а-я])(?:звук|тембр)\S*/g, ' '));
        if (name) return [...out, A('sound', { tracks: [id], name })];
      }
      return [...out, A('sound', { tracks: I, next: true })];
    }
    if (R.other.test(c) && !R.patWord.test(c) && !R.newW.test(c) && !Object.keys(variants).length && !R.solo.test(c)) {
      return [...out, A('sound', { tracks: I, next: true })];
    }
    if (R.except.test(c)) return [...out, A(R.mute.test(c) ? 'solo' : 'mute', { tracks: I })];
    if (R.solo.test(c)) return [...out, A('solo', { tracks: I, add: R.also.test(c) })];
    if (R.clear.test(c)) return [...out, A('clear', { tracks: I })];
    if (R.mute.test(c)) return [...out, A('mute', { tracks: I })];
    if (R.regen.test(c)) return [...out, A('regen', { tracks: I, variants })];
    if (R.less.test(c)) return [...out, A('density', { tracks: I, dir: -1 })];
    if (R.more.test(c)) return [...out, A('density', { tracks: I, dir: 1 })];
    const steps = stepsFromNums(c, nums.filter(n => n <= 16));
    if (R.add.test(c)) return [...out, A('add', { tracks: I, variants, steps })];
    return [...out, A('bare', { tracks: I, variants, steps })];
  }

  if (out.length) return out;
  if (R.stop.test(c)) return [A('stop')];
  if (R.play.test(c)) return [A('play')];
  const n = nums.length === 1 && c.replace(/\d+/, '').trim() === '' ? nums[0] : null;
  if (n && n >= 60 && n <= 200) return [A('tempo', { set: n })];
  return [];
}

const CARRY = ['add', 'mute', 'solo', 'clear', 'regen', 'vol', 'filter', 'drive', 'decay', 'pitch', 'fx', 'density', 'sound'];

export function parse(text) {
  const norm = normalize(text);
  let s = norm;
  if (/(?<![а-я])дол/.test(s)) {
    s = s.replace(/(?<![а-я])перв(?:ая|ую|ой|ый|ое|ые|ых)(?![а-я])/g, '1').replace(/(?<![а-я])втор(?:ая|ую|ой|ое|ые|ых)(?![а-я])/g, '2')
      .replace(/(?<![а-я])трет(?:ья|ью|ей|ий|ье|ьи|ьих)(?![а-я])/g, '3').replace(/(?<![а-я])четверт(?:ая|ую|ой|ый|ое|ые|ых)(?![а-я])/g, '4');
  }
  for (let i = 0; i < 3; i++) s = s.replace(/(\d+) (?:и |, )(\d+)/g, '$1 $2');
  const clauses = s.split(/\s*(?:,|(?<![а-я])(?:и|потом|затем|а еще|а также|а|после этого)(?![а-я]))\s*/).map(x => x.trim()).filter(Boolean);
  const parsed = clauses.map(parseClause);
  // «убери бочку и хэты» — у второй части нет глагола, берём его у соседней.
  for (let i = 0; i < parsed.length; i++) {
    parsed[i] = parsed[i].map(a => {
      if (a.type !== 'bare') return a;
      const near = [...parsed.slice(0, i).reverse(), ...parsed.slice(i + 1)].flat().find(b => CARRY.includes(b.type));
      if (!near) return { ...a, type: 'add' };
      const { tracks, variants, steps } = a;
      return {
        ...near, tracks, variants: near.type === 'add' || near.type === 'regen' ? variants : undefined, steps: near.type === 'add' ? steps : undefined,
        track: near.type === 'fx' || near.type === 'filter' ? tracks[0] : near.track, add: near.type === 'solo' ? true : near.add, name: undefined,
      };
    });
  }
  return { text: norm, actions: parsed.flat() };
}

export { VARIANTS };
