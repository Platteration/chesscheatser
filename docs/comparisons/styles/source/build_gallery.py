"""Package Blender renders without changing the individual sprite or board PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import html
import json
import math
import textwrap

SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parent
BUNDLE = OUT.parent
STYLE_IDS = ['arcade','neon','porcelain']
PACKS = [json.loads((OUT/style/'manifest.json').read_text()) for style in STYLE_IDS]
FONT_ROOT = Path('/usr/share/fonts/truetype/dejavu')
FAMILIES = ['chess','checkers','connect4','sudoku','effects']
GAMES = [('chess','Two Kings Chess'),('sudoku','Sudokuoku'),('checkers','5D Checkers'),('connect4','5D Connect Four')]
(OUT/'comparisons').mkdir(exist_ok=True)
VALIDATION = {'styles':3,'sprites':0,'boards':0,'alphaPadding':'passed','files':[]}

def font(size,bold=False):
    return ImageFont.truetype(str(FONT_ROOT/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),size)

def label(canvas,xy,body,size=18,bold=False,color='#20364c'):
    ImageDraw.Draw(canvas).text(xy,body,font=font(size,bold),fill=color)

def display(id):
    parts=id.split('-')
    return ' '.join(parts[1:]).title().replace('Digit ','Digit ')

def colors(theme):
    return ('#eef1f4','#193047','#506276') if theme=='light' else ('#142237','#edf2f9','#c3d1e2')

def paste_sprite(canvas,path,x,y,size):
    with Image.open(path) as image:
        image=image.convert('RGBA')
        if size!=256:
            image=image.resize((size,size),Image.Resampling.LANCZOS)
        canvas.paste(image,(x,y),image)

def item(pack,id):
    return next(sprite for sprite in pack['sprites'] if sprite['id']==id)

for pack in PACKS:
    assert len(pack['sprites'])==35 and len(pack['boards'])==4
    frames={}
    atlas=Image.new('RGBA',(7*256,5*256),(0,0,0,0))
    for index,sprite in enumerate(pack['sprites']):
        path=OUT/sprite['file']
        with Image.open(path) as image:
            image.load()
            assert image.mode=='RGBA' and image.size==(256,256),path
            alpha=image.getchannel('A')
            bbox=alpha.getbbox()
            assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<256 and bbox[3]<256,(path,bbox)
            assert min(alpha.getextrema())==0 and max(alpha.getextrema())==255,path
            x,y=(index%7)*256,(index//7)*256
            atlas.paste(image,(x,y))
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        sprite['sha256']=digest
        sprite['visibleBounds']={'x':bbox[0],'y':bbox[1],'width':bbox[2]-bbox[0],'height':bbox[3]-bbox[1]}
        frames[sprite['id']+'.png']={'frame':{'x':x,'y':y,'w':256,'h':256},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':256,'h':256},'sourceSize':{'w':256,'h':256},'visibleBounds':sprite['visibleBounds'],'family':sprite['family']}
        VALIDATION['sprites']+=1
        VALIDATION['files'].append({'file':str(path.relative_to(OUT)),'kind':'sprite','sha256':digest})
    atlas_path=OUT/pack['style']/'atlas.png'
    atlas.save(atlas_path,optimize=True)
    atlas_json={'frames':frames,'meta':{'image':'atlas.png','format':'RGBA8888','size':{'w':1792,'h':1280},'scale':'1','style':pack['style']}}
    (atlas_path.with_suffix('.json')).write_text(json.dumps(atlas_json,indent=2)+'\n')
    pack['atlas']=str(atlas_path.relative_to(OUT))
    pack['atlasMetadata']=str(atlas_path.with_suffix('.json').relative_to(OUT))
    for board in pack['boards']:
        path=OUT/board['file']
        with Image.open(path) as image:
            image.load()
            assert image.mode=='RGB' and image.size==(1024,1024),path
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        board['sha256']=digest
        VALIDATION['boards']+=1
        VALIDATION['files'].append({'file':str(path.relative_to(OUT)),'kind':'concept board','sha256':digest})
    assert (OUT/pack['source']).is_file(),pack['source']
    (OUT/pack['style']/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n')

for theme in ['light','dark']:
    bg,ink,muted=colors(theme)
    representatives=['chess-white-king','chess-black-knight','checkers-red-king','connect4-yellow-disc','sudoku-notes','fx-timeline-portal']
    canvas=Image.new('RGB',(1360,750),bg)
    label(canvas,(24,18),'Three sprite styles',32,True,ink)
    label(canvas,(24,63),'Original Blender assets | Transparent PNGs | Concept options | '+theme.title()+' background',17,color=muted)
    for col,pack in enumerate(PACKS):
        left=24+col*446
        label(canvas,(left,106),pack['name'],24,True,ink)
        for line_no,line in enumerate(textwrap.wrap(pack['description'],width=42)):
            label(canvas,(left,143+line_no*22),line,16,color=muted)
        for index,id in enumerate(representatives):
            x=left+(index%2)*213
            y=208+(index//2)*173
            paste_sprite(canvas,OUT/item(pack,id)['file'],x+36,y,128)
            label(canvas,(x+10,y+130),display(id),15,color=ink)
    canvas.save(OUT/'comparisons'/('sprite-styles-'+theme+'.png'),optimize=True)
    for family in FAMILIES:
        ids=[sprite['id']for sprite in PACKS[0]['sprites']if sprite['family']==family]
        columns=min(7,len(ids)) if family=='sudoku' else min(6,len(ids))
        rows=math.ceil(len(ids)/columns)
        canvas=Image.new('RGB',(212+columns*145,120+3*rows*166),bg)
        label(canvas,(24,18),family.title()+' sprites',30,True,ink)
        label(canvas,(24,60),'All three styles | 112 px previews | '+theme.title()+' background | Raw PNGs remain 256 x 256',16,color=muted)
        for style_index,pack in enumerate(PACKS):
            base=112+style_index*rows*166
            for line_no,line in enumerate(pack['name'].split()):
                label(canvas,(24,base+line_no*27),line,20,True,ink)
            for index,id in enumerate(ids):
                x=200+(index%columns)*145
                y=base+(index//columns)*166
                paste_sprite(canvas,OUT/item(pack,id)['file'],x+8,y,112)
                body=display(id)
                for line_no,line in enumerate(textwrap.wrap(body,width=17)):
                    label(canvas,(x+4,y+114+line_no*17),line,13,color=ink)
        canvas.save(OUT/'comparisons'/(family+'-'+theme+'.png'),optimize=True)
    canvas=Image.new('RGB',(1170,1056),bg)
    label(canvas,(24,18),'Small-size readability',31,True,ink)
    label(canvas,(24,63),'Same sprites at 48 px and 96 px | '+theme.title()+' background',18,color=muted)
    for style_index,pack in enumerate(PACKS):
        for size_index,size in enumerate([48,96]):
            y=126+(style_index*2+size_index)*152
            label(canvas,(24,y+20),pack['name'].split()[0],21,True,ink)
            label(canvas,(24,y+50),str(size)+' px',18,color=muted)
            for index,id in enumerate(representatives):
                x=184+index*160
                paste_sprite(canvas,OUT/item(pack,id)['file'],x+(128-size)//2,y+(96-size)//2,size)
                for line_no,line in enumerate(textwrap.wrap(display(id),width=19)):
                    label(canvas,(x,y+105+line_no*17),line,13,color=ink)
    canvas.save(OUT/'comparisons'/('small-sizes-'+theme+'.png'),optimize=True)

canvas=Image.new('RGB',(1624,2500),'#eef1f4')
label(canvas,(24,20),'Board concepts: Arcade, Neon and Porcelain',32,True)
label(canvas,(24,65),'12 Blender renders | Same reference position in each row | Concept artwork',18,color='#506276')
for row,(game,title) in enumerate(GAMES):
    top=110+row*594
    label(canvas,(24,top),title,24,True)
    for col,pack in enumerate(PACKS):
        x=24+col*532
        label(canvas,(x,top+37),pack['name'],19,True)
        board=next(board for board in pack['boards']if board['game']==game)
        with Image.open(OUT/board['file']) as image:
            canvas.paste(image.resize((512,512),Image.Resampling.LANCZOS),(x,top+66))
canvas.save(OUT/'comparisons/board-styles.png',optimize=True)

game_options=''.join(f'<option value="{id}">{title}</option>'for id,title in GAMES)
family_options=''.join(f'<option value="{family}">{family.title()}</option>'for family in FAMILIES)
sheet_links=''.join(f'<a href="comparisons/{family}-light.png">{family.title()} sheet</a>'for family in FAMILIES)
data=json.dumps(PACKS).replace('<','\\u003c')
gallery='''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprite and board style comparisons</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f4;color:#193047;font:16px/1.5 system-ui,sans-serif}main{max-width:1660px;padding:24px;margin:auto}h1{font-size:clamp(28px,4vw,42px);line-height:1.2;margin:12px 0}h2{margin-top:32px}p{max-width:1100px}.muted{color:#506276}a{color:#1a4e93}nav,.controls,.links{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:18px 0}label{display:grid;gap:4px}select{font:inherit;padding:9px;border:1px solid #8292a6;border-radius:7px;background:white;max-width:100%;color:inherit}.boards,.style-cards,.sprite-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}figure{margin:0;min-width:0}figure>img{width:100%;height:auto;display:block;border:1px solid #a9bac9;border-radius:8px}figcaption{font-weight:700;margin-bottom:7px}.style-card{border:1px solid #afbdcc;padding:16px;border-radius:9px;background:#fff}.style-card h3{margin-top:0}.swatches{display:flex;flex-wrap:wrap;gap:7px}.swatch{display:block;width:26px;height:26px;border-radius:6px;border:1px solid #9aabba}.sprite-row{padding:16px 0;border-bottom:1px solid #b9c4d0}.sprite-row h3{font-size:18px;margin:0 0 9px}.sprite-grid{gap:16px}.sprite-box{display:flex;justify-content:center;align-items:center;min-height:calc(var(--sprite-size) + 24px);border:1px solid #acbacb;border-radius:8px;background:var(--sprite-bg);overflow:hidden}.sprite-box img{display:block;width:var(--sprite-size);max-width:100%;height:auto}.checker .sprite-box{background-color:#e5e9f0;background-image:linear-gradient(45deg,#bac5d4 25%,transparent 25%),linear-gradient(-45deg,#bac5d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bac5d4 75%),linear-gradient(-45deg,transparent 75%,#bac5d4 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.sprite-grid figcaption{font-size:14px;line-height:1.3;min-height:20px}.sprite-grid a{font-size:14px;display:inline-block;margin-top:6px}footer{border-top:1px solid #acbacb;margin-top:32px;padding:18px 0}code{font-size:.94em}@media(max-width:650px){main{padding:16px}.boards,.style-cards{grid-template-columns:1fr}.sprite-grid{gap:9px}.sprite-grid figcaption,.sprite-grid a{font-size:12px}}
</style>
<main>
<nav><a href="../index.html">Original app screenshot comparisons</a><a href="README.md">Asset guide</a><a href="comparisons/board-styles.png">Full board comparison</a><a href="comparisons/sprite-styles-light.png">Sprite overview</a></nav>
<h1>Three styles to compare</h1>
<p>Original Blender artwork for Two Kings Chess, Sudokuoku, 5D Checkers and 5D Connect Four. Compare 105 transparent sprites, 12 board concepts, three sprite atlases and three editable Blender projects.</p>
<p class="muted">Concept options for choosing a visual style. App screenshots remain in the original comparison gallery. Board positions are held constant across the three styles.</p>
<div id="styles" class="style-cards"></div>
<h2>Board concepts</h2>
<div class="controls"><label for="game">App<select id="game">GAME_OPTIONS</select></label></div>
<p id="position" class="muted" aria-live="polite"></p>
<section id="boards" class="boards" aria-label="Three board style concepts"></section>
<h2>Transparent sprites</h2>
<div class="controls"><label for="family">Sprite family<select id="family">FAMILY_OPTIONS</select></label><label for="background">Preview background<select id="background"><option value="light">Light</option><option value="dark">Dark</option><option value="checker">Checkerboard</option></select></label><label for="size">Preview size<select id="size"><option value="48">48 px</option><option value="96" selected>96 px</option><option value="160">160 px</option><option value="256">256 px</option></select></label></div>
<p class="muted">PNG downloads have transparent backgrounds. The preview background and size controls affect this gallery only.</p>
<section id="sprites" aria-label="Sprite comparisons"></section>
<div class="links">SHEET_LINKS<a href="comparisons/small-sizes-light.png">48 and 96 px, light</a><a href="comparisons/small-sizes-dark.png">48 and 96 px, dark</a></div>
<footer><a href="source/render_styles.py">Blender rendering script</a> · <a href="source/palettes.json">Palette values</a> · <a href="manifest.json">Complete asset manifest</a> · <a href="validation.json">Asset validation</a></footer>
</main>
<script>
const packs=PACK_DATA;
const $=id=>document.getElementById(id);
function node(tag,text){const el=document.createElement(tag);if(text)el.textContent=text;return el;}
function link(href,label){const a=node('a',label);a.href=href;return a;}
function image(src,alt){const img=node('img');img.src=src;img.alt=alt;return img;}
function cards(){for(const pack of packs){const card=node('article');card.className='style-card';card.append(node('h3',pack.name),node('p',pack.description));const swatches=node('div');swatches.className='swatches';for(const key of ['background','light','dark','white','black','red','yellow','accent']){const s=node('span');s.className='swatch';s.style.background=pack.palette[key];s.title=key+': '+pack.palette[key];s.setAttribute('aria-label',s.title);swatches.append(s);}card.append(swatches,node('p'));card.lastChild.append(link(pack.source,'Editable Blender project'),' · ',link(pack.atlas,'Sprite atlas PNG'),' · ',link(pack.atlasMetadata,'Atlas JSON'));$('styles').append(card);}}
function boards(){const game=$('game').value;$('boards').replaceChildren();for(const pack of packs){const board=pack.boards.find(item=>item.game===game);const figure=node('figure');figure.append(node('figcaption',pack.name),image(board.file,pack.name+' '+game+' concept render'),link(board.file,'Full 1024 px concept PNG'));$('boards').append(figure);$('position').textContent=board.position;}}
function sprites(){const family=$('family').value;$('sprites').replaceChildren();for(const original of packs[0].sprites.filter(sprite=>sprite.family===family)){const row=node('article');row.className='sprite-row';row.append(node('h3',original.id.split('-').slice(1).join(' ')));const grid=node('div');grid.className='sprite-grid';for(const pack of packs){const sprite=pack.sprites.find(sprite=>sprite.id===original.id);const figure=node('figure'),box=node('div');box.className='sprite-box';box.append(image(sprite.file,pack.name+' '+sprite.id));figure.append(node('figcaption',pack.name),box,link(sprite.file,'Transparent PNG'));grid.append(figure);}row.append(grid);$('sprites').append(row);}}
function background(){document.documentElement.style.setProperty('--sprite-bg',$('background').value==='dark'?'#142237':'#f6f4ed');$('sprites').classList.toggle('checker',$('background').value==='checker');}
function size(){document.documentElement.style.setProperty('--sprite-size',$('size').value+'px');}
$('game').onchange=boards;$('family').onchange=sprites;$('background').onchange=background;$('size').onchange=size;cards();boards();sprites();background();size();
</script></html>'''.replace('GAME_OPTIONS',game_options).replace('FAMILY_OPTIONS',family_options).replace('SHEET_LINKS',sheet_links).replace('PACK_DATA',data)
(OUT/'index.html').write_text(gallery)
(OUT/'manifest.json').write_text(json.dumps({'created':'2026-10-13','kind':'Concept artwork','packs':PACKS,'totalSprites':105,'totalBoards':12,'spriteDimensions':[256,256],'boardDimensions':[1024,1024]},indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps(VALIDATION,indent=2)+'\n')

guide='''# Extra sprites and visuals

These are original concept assets added on 13 October 2026. Open [index.html](index.html) to compare all three styles. The existing app screenshots are preserved one folder above.

## Styles

- **Arcade Pop:** bold colours, faceted chess pieces, simple enamel tokens.
- **Neon Circuit:** midnight surfaces, luminous rims, cyan-violet chess pieces.
- **Porcelain Studio:** warm ivory, glazed blue pieces, brass details.

## Included in each style

- 12 chess sprites: white and black pawn, knight, bishop, rook, queen and king.
- 4 checkers sprites: red and black men and kings.
- 2 Connect Four sprites: red and yellow discs.
- 13 Sudoku tiles: digits 1–9 plus blank, selected, pencil notes and error states.
- 4 shared effect sprites: selection ring, timeline portal, shift arrows and crown badge.
- 4 board concepts: one for each app, with the same position across styles.
- A transparent 1792 × 1280 atlas with JSON frame coordinates.
- An editable Blender project containing a Sprite library scene and four concept board scenes.

There are **105 individual transparent PNG sprites**, **12 board concept PNGs**, **3 atlases**, and **3 Blender projects** in total. Individual sprites are 256 × 256. Board renders are 1024 × 1024. Sprites have clear alpha padding on every edge; alpha bounds and file hashes are recorded in each manifest. Atlas frames preserve the entire 256 × 256 sprite; sprites are not rotated or trimmed.

## Comparison sheets

- [Board styles](comparisons/board-styles.png)
- [Sprite overview, light](comparisons/sprite-styles-light.png) / [dark](comparisons/sprite-styles-dark.png)
- [48 and 96 px readability, light](comparisons/small-sizes-light.png) / [dark](comparisons/small-sizes-dark.png)
- Complete Chess, Checkers, Connect Four, Sudoku and effect sheets for light and dark backgrounds are in comparisons/.

The HTML gallery lets you choose an app, a sprite family, a light/dark/checkerboard preview background, and 48/96/160/256 px display sizes. It uses local relative files and has no external dependencies. Extract the entire archive before opening the gallery.

## Source and provenance

All shapes, materials and effects were authored procedurally in Blender 4.3.2 and rendered with Cycles on CPU. There are no downloaded textures or artwork. Digits use Blender's built-in font converted to mesh geometry. The current Blender build lacks OpenImageDenoise, so renders use 32 samples for sprites and 64 samples for boards with denoising disabled. The individual sprite and board PNGs are unaltered Blender output. Comparison sheets uniformly scale and arrange these outputs; their labels are outside the artwork.

The positions were generated through the existing game engines and saved in source/fixtures.json. Chess uses the same mirror-army seed 1 as the original screenshots. Checkers and Connect Four use the same four opening moves. Sudoku uses the same seed 20261011 puzzle and pencil notes. Palettes intentionally explore different colours and materials; these are concept options for visual review. Application and native device integration has not been performed for these options.

From this folder, regenerate a pack using:

```sh
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style arcade
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style neon
blender -b -t 2 --python-exit-code 1 --python source/render_styles.py -- --style porcelain
```

The renderer requires only Blender and the included JSON files. The optional fixtures.cjs helper regenerates reference states from the existing /workspace repositories. The comparison-sheet helper build_gallery.py requires Python with Pillow and the DejaVu fonts used by this workspace. No app checkout is needed to edit or re-render the Blender projects.
'''
(OUT/'README.md').write_text(guide)
root_index=BUNDLE/'index.html'
content=root_index.read_text()
if 'styles/index.html' not in content:
    content=content.replace('<main>','<main>\n<p><a href="styles/index.html"><strong>New: compare extra sprite and board styles</strong></a> · <a href="styles/comparisons/board-styles.png">Board style sheet</a></p>',1)
root_index.write_text(content)
root_readme=BUNDLE/'README.md'
content=root_readme.read_text()
if '## Extra sprite styles — 13 October 2026' not in content:
    section='''
## Extra sprite styles — 13 October 2026

Added **105 transparent sprites**, **12 matching board concepts**, **3 atlases** and **3 editable Blender projects** in Arcade Pop, Neon Circuit and Porcelain Studio styles.

- [Interactive style gallery](styles/index.html)
- [All board styles](styles/comparisons/board-styles.png)
- [Sprite style overview](styles/comparisons/sprite-styles-light.png)
- [Asset guide, sources and rendering instructions](styles/README.md)

The existing screenshots below retain their original capture date and source revisions. The new artwork is labelled as concept options.

'''
    first,rest=content.split('\n',1)
    content=first+'\n'+section+rest
root_readme.write_text(content)
print('Created style gallery, 15 comparison sheets, three transparent atlases and metadata.')
print('Validated',VALIDATION['sprites'],'sprites and',VALIDATION['boards'],'board renders.')
