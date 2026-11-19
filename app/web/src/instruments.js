/* Instrument profiles and ensemble templates used by the score editor. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.KanadeInstruments=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const legacy=[
  ['piccolo','ピッコロ','木管','treble','octaveUp','フルート',0],
  ['flute','フルート','木管','treble','concert','フルート',0],
  ['oboe','オーボエ','木管','treble','concert','オーボエ',0],
  ['bassoon','ファゴット','木管','bass','concert','ファゴット',0],
  ['clarinet','B♭ クラリネット','木管','treble','bb','クラリネット',2],
  ['bassClarinet','バス・クラリネット','木管','treble','bbBass','クラリネット',2],
  ['alto','アルト・サクソフォン','木管','treble','eb','アルトサックス',3],
  ['tenor','テナー・サクソフォン','木管','treble','bbBass','テナーサックス',2],
  ['baritone','バリトン・サクソフォン','木管','treble','ebBass','テナーサックス',3],
  ['trumpet','B♭ トランペット','金管','treble','bb','トランペット',2],
  ['horn','F ホルン','金管','treble','f','ホルン',1],
  ['mellophone','F メロフォン','金管','treble','f','ホルン',1],
  ['trombone','トロンボーン','金管','bass','concert','トロンボーン',0],
  ['baritoneHorn','マーチング・バリトン','金管','bass','concert','ユーフォニアム',0],
  ['euphonium','ユーフォニアム','金管','bass','concert','ユーフォニアム',0],
  ['tuba','チューバ','金管','bass','concert','チューバ',0],
  ['contrabass','コントラバス','弦・鍵盤','bass','octaveDown','ヴァイオリン',0],
  ['piano','ピアノ','弦・鍵盤','treble','concert','ピアノ',0],
  ['mallets','鍵盤打楽器','打楽器','treble','concert','ピアノ',0],
  ['timpani','ティンパニ','打楽器','bass','concert','ティンパニ',0],
  ['snare','スネアドラム','打楽器','percussion','concert','マーチング・スネア',0,1],
  ['tenors','マーチング・テナー','打楽器','percussion','concert','マーチング・テナー',0,5],
  ['basses','バスドラム','打楽器','percussion','concert','マーチング・バスドラム',0,5],
  ['cymbals','シンバル','打楽器','percussion','concert','マーチング・シンバル',0,1]
 ].map(([key,name,group,clef,transposition,sound,fifths,staffLines=5])=>({key,name,group,clef,transposition,sound,fifths,staffLines}));
 const legacyEnglish={
  piccolo:'Piccolo',flute:'Flute',oboe:'Oboe',bassoon:'Bassoon',clarinet:'B♭ Clarinet',bassClarinet:'Bass Clarinet',
  alto:'Alto Saxophone',tenor:'Tenor Saxophone',baritone:'Baritone Saxophone',trumpet:'B♭ Trumpet',horn:'F Horn',
  mellophone:'F Mellophone',trombone:'Trombone',baritoneHorn:'Marching Baritone',euphonium:'Euphonium',tuba:'Tuba',
  contrabass:'Double Bass',piano:'Piano',mallets:'Mallet Percussion',timpani:'Timpani',snare:'Snare Drum',
  tenors:'Marching Tenors',basses:'Bass Drum',cymbals:'Cymbals'
 };
 const variants={
  piccolo:'ピッコロ',bassClarinet:'バス・クラリネット',baritone:'バリトン・サクソフォン',
  mellophone:'F メロフォン',baritoneHorn:'マーチング・バリトン',contrabass:'コントラバス',mallets:'鍵盤打楽器'
 };
 const extras=`
木管
altoFlute|アルトフルート|Alto Flute|treble|g|フルート
bassFlute|バスフルート|Bass Flute|treble|octaveDown|フルート
contrabassFlute|コントラバスフルート|Contrabass Flute|treble|twoOctavesDown|フルート
oboeDAmore|オーボエ・ダモーレ|Oboe d’Amore|treble|a|オーボエ
englishHorn|イングリッシュホルン|English Horn|treble|f|オーボエ
bassOboe|バスオーボエ|Bass Oboe|treble|octaveDown|オーボエ
contraBassoon|コントラファゴット|Contrabassoon|bass|octaveDown|ファゴット
ebClarinet|E♭ クラリネット|E♭ Clarinet|treble|ebHigh|クラリネット
aClarinet|A クラリネット|A Clarinet|treble|a|クラリネット
bassetHorn|バセットホルン|Basset Horn|treble|f|クラリネット
altoClarinet|アルトクラリネット|Alto Clarinet|treble|eb|クラリネット
contraAltoClarinet|コントラアルトクラリネット|Contra-Alto Clarinet|treble|ebBass|クラリネット
contraBassClarinet|コントラバスクラリネット|Contrabass Clarinet|treble|bbContra|クラリネット
sopraninoSax|ソプラニーノサクソフォン|Sopranino Saxophone|treble|ebHigh|アルトサックス
sopranoSax|ソプラノサクソフォン|Soprano Saxophone|treble|bb|アルトサックス
bassSax|バスサクソフォン|Bass Saxophone|treble|bbContra|テナーサックス
contraSax|コントラバスサクソフォン|Contrabass Saxophone|treble|ebContra|テナーサックス
sopraninoRecorder|ソプラニーノリコーダー|Sopranino Recorder|treble|octaveUp|フルート
sopranoRecorder|ソプラノリコーダー|Soprano Recorder|treble|octaveUp|フルート
altoRecorder|アルトリコーダー|Alto Recorder|treble|concert|フルート
tenorRecorder|テナーリコーダー|Tenor Recorder|treble|concert|フルート
bassRecorder|バスリコーダー|Bass Recorder|bass|octaveUp|フルート
greatBassRecorder|グレートバスリコーダー|Great Bass Recorder|bass|concert|フルート
fife|ファイフ|Fife|treble|octaveUp|フルート
harmonica|ハーモニカ|Harmonica
shawm|ショーム|Shawm|treble|concert|オーボエ
金管
cTrumpet|C トランペット|C Trumpet|treble|concert|トランペット
piccoloTrumpet|B♭ ピッコロトランペット|B♭ Piccolo Trumpet|treble|bbHigh|トランペット
bassTrumpet|B♭ バストランペット|B♭ Bass Trumpet|treble|bbBass|トランペット
cornet|B♭ コルネット|B♭ Cornet|treble|bb|トランペット
sopranoCornet|E♭ ソプラノコルネット|E♭ Soprano Cornet|treble|ebHigh|トランペット
flugelhorn|フリューゲルホルン|Flugelhorn|treble|bb|トランペット
tenorHorn|E♭ テナーホルン|E♭ Tenor Horn|treble|eb|ホルン
wagnerTuba|F ワーグナーチューバ|F Wagner Tuba|treble|f|ホルン
altoTrombone|アルトトロンボーン|Alto Trombone|alto|concert|トロンボーン
bassTrombone|バストロンボーン|Bass Trombone|bass|concert|トロンボーン
contraTrombone|コントラバストロンボーン|Contrabass Trombone|bass|concert|トロンボーン
trebleTrombone|トロンボーン（B♭ ト音）|Trombone (B♭ Treble)|treble|bbBass|トロンボーン
trebleBaritone|B♭ バリトンホルン|B♭ Baritone Horn|treble|bbBass|チューバ
trebleEuphonium|ユーフォニアム（B♭ ト音）|Euphonium (B♭ Treble)|treble|bbBass|チューバ
ebBass|E♭ バス（ト音）|E♭ Bass (Treble)|treble|ebBass|チューバ
bbBass|B♭ バス（ト音）|B♭ Bass (Treble)|treble|bbContra|チューバ
sousaphone|スーザフォン|Sousaphone|bass|concert|チューバ
contraBugle|マーチング・コントラ|Marching Contra|bass|concert|チューバ
bugle|ビューグル|Bugle|treble|bb|トランペット
serpent|セルパン|Serpent|bass|concert|チューバ
ophicleide|オフィクレイド|Ophicleide|bass|concert|チューバ
弦・鍵盤
violin|ヴァイオリン|Violin
viola|ヴィオラ|Viola|alto|concert|ヴァイオリン
cello|チェロ|Cello|bass|concert|ヴァイオリン
harp|ハープ|Harp
classicalGuitar|クラシックギター|Classical Guitar|treble|octaveDown
acousticGuitar|アコースティックギター|Acoustic Guitar|treble|octaveDown
electricGuitar|エレクトリックギター|Electric Guitar|treble|octaveDown
electricBass|エレクトリックベース|Electric Bass|bass|octaveDown
mandolin|マンドリン|Mandolin
ukulele|ウクレレ|Ukulele
banjo|バンジョー|Banjo
harpsichord|チェンバロ|Harpsichord|treble|concert|ピアノ
celesta|チェレスタ|Celesta|treble|octaveUp
pipeOrgan|パイプオルガン|Pipe Organ
accordion|アコーディオン|Accordion
bandoneon|バンドネオン|Bandoneon
theorbo|テオルボ|Theorbo|bass
lute|リュート|Lute
打楽器
glockenspiel|グロッケンシュピール|Glockenspiel|treble|twoOctavesUp
xylophone|シロフォン|Xylophone|treble|octaveUp
marimba|マリンバ|Marimba
bassMarimba|バスマリンバ|Bass Marimba|bass
vibraphone|ヴィブラフォン|Vibraphone
crotales|クロテイル|Crotales|treble|twoOctavesUp
tubularBells|チャイム|Tubular Bells
handbells|ハンドベル|Handbells
steelPan|スティールパン|Steel Pan
handpan|ハンドパン|Handpan
melodicCowbells|音程付きカウベル|Almglocken
rototoms|ロートタム|Rototoms
orchestralBassDrum|コンサート・バスドラム|Concert Bass Drum|percussion|concert||1
fieldDrum|フィールドドラム|Field Drum|percussion|concert||1
piccoloSnare|ピッコロスネア|Piccolo Snare|percussion|concert||1
tenorDrum|テナードラム|Tenor Drum|percussion|concert||1
sideDrum|サイドドラム|Side Drum|percussion|concert||1
tomToms|コンサートタム|Concert Toms|percussion
drumSet|ドラムセット|Drum Set|percussion
floorTom|フロアタム|Floor Tom|percussion|concert||1
kickDrum|キックドラム|Kick Drum|percussion|concert||1
hiHat|ハイハット|Hi-Hat|percussion|concert||1
rideCymbal|ライドシンバル|Ride Cymbal|percussion|concert||1
splashCymbal|スプラッシュシンバル|Splash Cymbal|percussion|concert||1
chinaCymbal|チャイナシンバル|China Cymbal|percussion|concert||1
suspendedCymbal|サスペンデッドシンバル|Suspended Cymbal|percussion|concert||1
tamTam|タムタム|Tam-tam|percussion|concert||1
gong|ゴング|Gong|percussion|concert||1
triangle|トライアングル|Triangle|percussion|concert||1
tambourine|タンバリン|Tambourine|percussion|concert||1
woodBlock|ウッドブロック|Wood Block|percussion|concert||1
templeBlocks|テンプルブロック|Temple Blocks|percussion
castanets|カスタネット|Castanets|percussion|concert||1
claves|クラベス|Claves|percussion|concert||1
cowbell|カウベル|Cowbell|percussion|concert||1
agogo|アゴゴベル|Agogô Bells|percussion|concert||2
cabasa|カバサ|Cabasa|percussion|concert||1
guiro|ギロ|Güiro|percussion|concert||1
maracas|マラカス|Maracas|percussion|concert||1
shaker|シェイカー|Shaker|percussion|concert||1
eggShaker|エッグシェイカー|Egg Shaker|percussion|concert||1
rainstick|レインスティック|Rainstick|percussion|concert||1
vibraslap|ヴィブラスラップ|Vibraslap|percussion|concert||1
ratchet|ラチェット|Ratchet|percussion|concert||1
slapstick|むち（スラップスティック）|Slapstick|percussion|concert||1
sleighBells|スレイベル|Sleigh Bells|percussion|concert||1
windChimes|ウィンドチャイム|Wind Chimes|percussion|concert||1
fingerCymbals|フィンガーシンバル|Finger Cymbals|percussion|concert||1
brakeDrum|ブレーキドラム|Brake Drum|percussion|concert||1
anvil|アンビル|Anvil|percussion|concert||1
waterphone|ウォーターフォン|Waterphone|percussion|concert||1
thunderSheet|サンダーシート|Thunder Sheet|percussion|concert||1
flexatone|フレクサトーン|Flexatone|percussion|concert||1
slideWhistle|スライドホイッスル|Slide Whistle|percussion|concert||1
birdWhistle|バードホイッスル|Bird Whistle|percussion|concert||1
congas|コンガ|Congas|percussion|concert||2
bongos|ボンゴ|Bongos|percussion|concert||2
timbales|ティンバレス|Timbales|percussion|concert||2
cajon|カホン|Cajón|percussion|concert||2
djembe|ジャンベ|Djembe|percussion|concert||2
darbuka|ダラブッカ|Darbuka|percussion|concert||2
frameDrum|フレームドラム|Frame Drum|percussion|concert||1
bodhran|バウロン|Bodhrán|percussion|concert||1
tabla|タブラ|Tabla|percussion|concert||2
surdo|スルド|Surdo|percussion|concert||1
pandeiro|パンデイロ|Pandeiro|percussion|concert||1
cuica|クイーカ|Cuíca|percussion|concert||1
taiko|和太鼓|Taiko|percussion|concert||1
shimeDaiko|締太鼓|Shime-daiko|percussion|concert||1
odaiko|大太鼓（和太鼓）|Ōdaiko|percussion|concert||1
hyoshigi|拍子木|Hyōshigi|percussion|concert||1
atariGane|当り鉦|Atarigane|percussion|concert||1
民族・古楽
shakuhachi|尺八|Shakuhachi
shinobue|篠笛|Shinobue
sho|笙|Shō
hichiriki|篳篥|Hichiriki
ryuteki|龍笛|Ryūteki
koto|箏|Koto
shamisen|三味線|Shamisen
sanshin|三線|Sanshin
biwa|琵琶|Biwa
erhu|二胡|Erhu
pipa|琵琶（中国）|Pipa
guzheng|古箏|Guzheng
dizi|笛子|Dizi
duduk|ドゥドゥク|Duduk
ney|ネイ|Ney
ocarina|オカリナ|Ocarina
panFlute|パンフルート|Pan Flute
tinWhistle|ティンホイッスル|Tin Whistle
bagpipes|バグパイプ|Bagpipes
didgeridoo|ディジュリドゥ|Didgeridoo|bass
sitar|シタール|Sitar
oud|ウード|Oud
santur|サントゥール|Santur
kora|コラ|Kora
nyckelharpa|ニッケルハルパ|Nyckelharpa
violaDaGamba|ヴィオラ・ダ・ガンバ|Viola da Gamba|bass|concert|ヴァイオリン
声楽・電子
sopranoVoice|ソプラノ|Soprano
mezzoVoice|メゾソプラノ|Mezzo-Soprano
altoVoice|アルト|Alto
tenorVoice|テナー|Tenor|treble|octaveDown
baritoneVoice|バリトン|Baritone|bass
bassVoice|バス|Bass|bass
electricPiano|エレクトリックピアノ|Electric Piano|treble|concert|ピアノ
synthLead|シンセリード|Synth Lead
synthPad|シンセパッド|Synth Pad
synthBass|シンセベース|Synth Bass|bass
theremin|テルミン|Theremin
ondes|オンド・マルトノ|Ondes Martenot
`.trim().split('\n');
 const fifths={bb:2,bbHigh:2,bbBass:2,bbContra:2,eb:3,ebHigh:3,ebBass:3,ebContra:3,a:3,f:1,g:-1};
 const catalog=legacy.map(item=>{
  const variant=variants[item.key];
  return {...item,english:legacyEnglish[item.key],...(variant?{sound:variant,fallback:item.sound}:{}),
    ...(item.key==='euphonium'?{fallback:'チューバ'}:{})};
 });
 let group;
 for(const line of extras){
  if(!line.includes('|')){group=line;continue;}
  const [key,name,english,clef='treble',transposition='concert',fallback,lines]=line.split('|');
  catalog.push({key,name,english,group,clef,transposition,sound:name,fallback,fifths:fifths[transposition]||0,staffLines:Number(lines)||5});
 }
 const byKey=new Map(catalog.map(item=>[item.key,item]));
 const bySound=new Map(catalog.map(item=>[item.sound,item]));
 const names=catalog.flatMap(item=>[[item.name,item],[item.english,item]]).sort(([a],[b])=>b.length-a.length);
 const match=name=>names.find(([label])=>name===label||name.startsWith(label+' ')&&/^ [0-9]+$/.test(name.slice(label.length)));
 const profile=part=>byKey.get(part.instrumentKey)||match(part.instrument)?.[1];
 function numberParts(parts,indices){
  const changed=new Set(indices),keys=new Set(indices.map(index=>profile(parts[index])?.key).filter(Boolean));
  const result=parts.slice();
  for(const key of keys){
   const item=byKey.get(key),members=parts.flatMap((part,index)=>profile(part)?.key===key?[index]:[]);
   if(members.length<2)continue;
   const reserved=new Set(),renumber=[];
   // Existing labels take priority when another preset introduces the same numbers.
   for(const index of members.sort((a,b)=>Number(changed.has(a))-Number(changed.has(b))||a-b)){
    const part=parts[index],matched=match(part.instrument);
    if(matched?.[1]!==item)continue;
    const label=matched[0],number=Number(part.instrument.slice(label.length));
    if(number>0&&(!reserved.has(number)||!changed.has(index)||part.customInstrumentName))reserved.add(number);
    else if(!part.customInstrumentName)renumber.push([index,label]);
   }
   let next=1;
   for(const [index,label] of renumber){
    while(reserved.has(next))next++;
    result[index]={...parts[index],instrumentKey:key,instrument:label+' '+next,sound:parts[index].sound||item.sound};
    reserved.add(next++);
   }
  }
  return result;
 }
 const lists={wind:['flute','oboe','bassoon','clarinet','clarinet','bassClarinet','alto','tenor','baritone','trumpet','trumpet','horn','trombone','trombone','euphonium','tuba','timpani','mallets','snare','basses','cymbals'],
  marching:['piccolo','flute','clarinet','alto','tenor','trumpet','trumpet','mellophone','baritoneHorn','tuba','snare','tenors','basses','cymbals','mallets']
 };
 const templates=[
  ['wind','吹奏楽','大編成',lists.wind],['marching','マーチング','大編成',lists.marching],
  ['schoolWind','学校吹奏楽（25人）','大編成','flute flute oboe bassoon clarinet clarinet clarinet clarinet clarinet alto alto tenor trumpet trumpet trumpet horn horn trombone trombone euphonium tuba tuba snare orchestralBassDrum suspendedCymbal'],
  ['schoolMarching','学校マーチング','大編成','piccolo flute flute clarinet clarinet clarinet clarinet alto alto tenor trumpet trumpet trumpet trumpet mellophone mellophone baritoneHorn baritoneHorn tuba tuba snare tenors basses cymbals glockenspiel'],
  ['smallWind','小編成吹奏楽','大編成','flute oboe clarinet clarinet alto tenor trumpet trumpet horn trombone euphonium tuba snare orchestralBassDrum'],
  ['windSymphony','シンフォニック・ウィンド','大編成','piccolo flute flute oboe englishHorn bassoon ebClarinet clarinet clarinet clarinet bassClarinet alto alto tenor baritone trumpet trumpet trumpet horn horn horn trombone trombone bassTrombone euphonium tuba contrabass timpani marimba snare orchestralBassDrum suspendedCymbal'],
  ['marchBattery','マーチング・バッテリー','大編成','snare snare tenors basses cymbals'],
  ['marchFront','マーチング・フロント','大編成','marimba marimba vibraphone xylophone glockenspiel timpani drumSet suspendedCymbal electricBass'],
  ['brassBand','英国式ブラスバンド','大編成','sopranoCornet cornet cornet cornet cornet cornet cornet cornet cornet cornet flugelhorn tenorHorn tenorHorn tenorHorn trebleBaritone trebleBaritone trebleTrombone trebleTrombone bassTrombone trebleEuphonium trebleEuphonium ebBass ebBass bbBass bbBass timpani snare orchestralBassDrum suspendedCymbal'],
  ['orchestra','管弦楽','大編成','piccolo flute flute oboe oboe clarinet clarinet bassoon bassoon horn horn horn horn cTrumpet cTrumpet trombone trombone bassTrombone tuba timpani orchestralBassDrum suspendedCymbal harp violin violin viola cello contrabass'],
  ['bigBand','ビッグバンド','ジャズ','alto alto tenor tenor baritone trumpet trumpet trumpet trumpet trombone trombone trombone bassTrombone piano electricGuitar contrabass drumSet'],
  ['jazzTrio','ジャズ・ピアノトリオ','ジャズ','piano contrabass drumSet'],
  ['jazzQuartet','ジャズ・カルテット','ジャズ','tenor piano contrabass drumSet'],
  ['popBand','ポップスバンド','ポップス','sopranoVoice electricGuitar electricBass electricPiano drumSet'],
  ['fluteTrio','フルート三重奏','木管','flute flute flute'],
  ['fluteQuartet','フルート四重奏','木管','flute flute altoFlute bassFlute'],
  ['clarinetQuartet','クラリネット四重奏','木管','clarinet clarinet clarinet bassClarinet'],
  ['clarinetChoir','クラリネット合奏','木管','ebClarinet clarinet clarinet clarinet altoClarinet bassClarinet contraAltoClarinet contraBassClarinet'],
  ['saxQuartet','サクソフォン四重奏（SATB）','木管','sopranoSax alto tenor baritone'],
  ['saxQuintet','サクソフォン五重奏','木管','sopranoSax alto alto tenor baritone'],
  ['woodwindTrio','木管三重奏','木管','oboe clarinet bassoon'],
  ['woodwindQuintet','木管五重奏','木管','flute oboe clarinet horn bassoon'],
  ['recorderQuartet','リコーダー四重奏','木管','sopranoRecorder altoRecorder tenorRecorder bassRecorder'],
  ['brassTrio','金管三重奏','金管','trumpet horn trombone'],
  ['brassQuintet','金管五重奏','金管','trumpet trumpet horn trombone tuba'],
  ['brassOctet','金管八重奏','金管','trumpet trumpet trumpet horn horn trombone bassTrombone tuba'],
  ['trumpetQuartet','トランペット四重奏','金管','trumpet trumpet trumpet trumpet'],
  ['hornQuartet','ホルン四重奏','金管','horn horn horn horn'],
  ['tromboneQuartet','トロンボーン四重奏','金管','trombone trombone trombone bassTrombone'],
  ['lowBrass','ユーフォニアム・テューバ四重奏','金管','euphonium euphonium tuba tuba'],
  ['strings','弦楽合奏','弦・鍵盤','violin violin viola cello contrabass'],
  ['stringQuartet','弦楽四重奏','弦・鍵盤','violin violin viola cello'],
  ['pianoTrio','ピアノ三重奏','弦・鍵盤','violin cello piano'],
  ['percussionQuartet','打楽器四重奏','打楽器','marimba vibraphone timpani snare'],
  ['percussionSextet','打楽器六重奏','打楽器','glockenspiel xylophone marimba vibraphone timpani suspendedCymbal'],
  ['latinPercussion','ラテン打楽器アンサンブル','打楽器','congas bongos timbales claves agogo shaker'],
  ['satb','混声四部合唱（SATB）','声楽','sopranoVoice altoVoice tenorVoice bassVoice'],
  ['japanese','和楽器アンサンブル','民族・古楽','shakuhachi shinobue koto shamisen taiko']
 ].map(([id,name,category,keys])=>({id,name,category,keys:typeof keys==='string'?keys.split(' '):keys}));
 return {catalog,byKey,bySound,match,profile,numberParts,templates,fifths};
});
