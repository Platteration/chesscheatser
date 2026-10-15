"""Original procedural art. Blender 4.3+: blender -b -t 2 --python render_styles.py -- --style arcade

Creates 35 transparent sprites, four matching board concepts, and an editable
Blender file with five scenes. Requires no downloaded textures or fonts.
"""
from pathlib import Path
import argparse
import json
import math
import sys
import time
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--style', choices=['arcade', 'neon', 'porcelain'], required=True)
parser.add_argument('--probe', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parent
STYLE = args.style
P = json.loads((SOURCE / 'palettes.json').read_text())[STYLE]
FIXTURES = json.loads((SOURCE / 'fixtures.json').read_text())
DEST = OUT / STYLE
(DEST / 'sprites').mkdir(parents=True, exist_ok=True)
(DEST / 'boards').mkdir(exist_ok=True)
ASSETS = {}
MATS = {}
STARTED = time.monotonic()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

def linear(hex_color):
    rgb = [int(hex_color.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4 for value in rgb)

def material(key, emissive=False):
    tag = key + ('-glow' if emissive else '')
    if tag in MATS:
        return MATS[tag]
    mat = bpy.data.materials.new(STYLE + ' / ' + tag)
    mat.use_nodes = True
    color = (*linear(P[key]), 1)
    mat.diffuse_color = color
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = P['roughness']
    shader.inputs['Metallic'].default_value = P['metallic'] if key not in ['ink', 'background', 'surface'] else 0
    shader.inputs['Coat Weight'].default_value = P['coat']
    if emissive or STYLE == 'arcade':
        shader.inputs['Emission Color'].default_value = color
        shader.inputs['Emission Strength'].default_value = 1.0 if emissive and STYLE == 'neon' else .12
    MATS[tag] = mat
    return mat

def empty(name, collection, location=(0, 0, 0)):
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    root.location = location
    return root

def link(obj, root, key, location):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    obj.location = location
    if key:
        obj.data.materials.append(material(key))
    return obj

def bevel(obj, width=.02):
    mod = obj.modifiers.new('Soft edge', 'BEVEL')
    mod.width = width
    mod.segments = 2 if STYLE == 'arcade' else 4
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def cube(root, name, location, size, key, edge=0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(obj, root, key, location)
    if edge:
        bevel(obj, edge)
    return obj

def cylinder(root, name, location, radius, depth, key, edge=.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=P['segments'], radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    link(obj, root, key, location)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4 and P['segments'] > 16
    if edge:
        bevel(obj, edge)
    return obj

def sphere(root, name, location, radius, key, scale=(1, 1, 1)):
    if STYLE == 'arcade':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    link(obj, root, key, location)
    for face in obj.data.polygons:
        face.use_smooth = STYLE != 'arcade'
    return obj

def torus(root, name, location, radius, thickness, key, glow=False):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=10, major_radius=radius, minor_radius=thickness)
    obj = bpy.context.object
    obj.name = name
    link(obj, root, None, location)
    obj.data.materials.append(material(key, glow))
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

def lathe(root, name, profile, key):
    segments = P['segments']
    vertices = [(radius*math.cos(i*2*math.pi/segments), radius*math.sin(i*2*math.pi/segments), z) for z, radius in profile for i in range(segments)]
    faces = []
    for ring in range(len(profile)-1):
        for i in range(segments):
            faces.append((ring*segments+i, ring*segments+(i+1)%segments, (ring+1)*segments+(i+1)%segments, (ring+1)*segments+i))
    faces += [tuple(reversed(range(segments))), tuple((len(profile)-1)*segments+i for i in range(segments))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    mesh.materials.append(material(key))
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices) == 4 and segments > 16
    return obj

def silhouette(root, name, points, key, depth=.07, plane='xy'):
    n = len(points)
    if plane == 'xy':
        vertices = [(x, y, z) for z in [0, depth] for x, y in points]
    else:
        vertices = [(x, y, z) for y in [-depth/2, depth/2] for x, z in points]
    faces = [tuple(reversed(range(n))), tuple(n+i for i in range(n))]
    faces += [(i, (i+1)%n, n+(i+1)%n, n+i) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    mesh.materials.append(material(key))
    bevel(obj, .015)
    return obj

def text(root, label, location, size, key):
    curve = bpy.data.curves.new('Digit ' + label, 'FONT')
    curve.body = label
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = .002
    obj = bpy.data.objects.new('Digit ' + label, curve)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    obj.location = location
    curve.materials.append(material(key))
    # Converting the built-in font to geometry keeps the .blend self-contained.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return obj

def scene(name, sprite=False):
    result = bpy.data.scenes.new(name)
    bpy.context.window.scene = result
    result.render.engine = 'CYCLES'
    result.cycles.samples = 32 if sprite else 64
    result.cycles.use_denoising = False
    result.cycles.use_adaptive_sampling = True
    result.cycles.adaptive_threshold = .035
    result.render.threads_mode = 'FIXED'
    result.render.threads = 2
    result.render.image_settings.file_format = 'PNG'
    result.render.image_settings.color_mode = 'RGBA' if sprite else 'RGB'
    result.render.film_transparent = sprite
    result.view_settings.view_transform = 'Standard'
    result.view_settings.look = 'None'
    world = bpy.data.worlds.new(name + ' world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.45, .48, .55, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    result.world = world
    lights = []
    for label, location, energy, size in [('Key', (-3, -4, 7), 420, 5), ('Fill', (4, 1, 5), 170, 4)]:
        data = bpy.data.lights.new(label, 'AREA')
        data.energy = energy
        data.shape = 'DISK'
        data.size = size
        obj = bpy.data.objects.new(label, data)
        result.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, .4))-obj.location).to_track_quat('-Z', 'Y').to_euler()
        lights.append(obj)
    camera_data = bpy.data.cameras.new(name + ' camera')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new('Camera', camera_data)
    result.collection.objects.link(camera)
    result.camera = camera
    return result, lights

def camera(result, target, offset, scale):
    result.camera.location = Vector(target)+Vector(offset)
    result.camera.rotation_euler = (Vector(target)-result.camera.location).to_track_quat('-Z', 'Y').to_euler()
    result.camera.data.ortho_scale = scale

def render(result, path, size):
    result.render.resolution_x = result.render.resolution_y = size
    result.render.resolution_percentage = 100
    result.render.filepath = str(path)
    bpy.context.window.scene = result
    bpy.ops.render.render(write_still=True)
    print('ASSET_DONE', STYLE, path.relative_to(OUT), round(time.monotonic()-STARTED, 1), flush=True)

def asset(id, family):
    collection = bpy.data.collections.new(id)
    LIBRARY.collection.children.link(collection)
    index = len(ASSETS)
    root = empty(id, collection, (30+(index%7)*3, 30+(index//7)*3, 0))
    root['asset_id'] = id
    root['style'] = STYLE
    root['family'] = family
    ASSETS[id] = {'root': root, 'collection': collection, 'family': family}
    return root

def chess_piece(root, kind, side):
    body = 'white' if side == 'white' else 'black'
    trim = 'whiteEdge' if side == 'white' else 'blackEdge'
    lathe(root, 'Turned base and stem', [(0,.32),(.045,.36),(.10,.35),(.16,.28),(.21,.28),(.26,.21),(.39,.14),(.60,.11),(.67,.23),(.73,.23)], body)
    torus(root, 'Distinctive base rim', (0,0,.10), .34, .020, trim, STYLE == 'neon')
    if kind == 'pawn':
        sphere(root, 'Pawn head', (0,0,.92), .22, body)
    elif kind == 'knight':
        points = [(-.21,.70),(-.23,.91),(-.10,1.20),(-.17,1.43),(-.03,1.36),(.13,1.30),(.36,1.16),(.39,1.02),(.21,.98),(.08,1.07),(.09,.84),(.22,.70)]
        silhouette(root, 'Original horse profile', points, body, .28, 'xz')
        sphere(root, 'Horse eye', (.10,-.148,1.25), .026, trim)
        cube(root, 'Mane', (-.17,-.02,1.08), (.07,.32,.34), trim, .018)
    elif kind == 'bishop':
        lathe(root, 'Bishop mitre', [(.73,.13),(.82,.24),(.99,.26),(1.18,.17),(1.38,.018)], body)
        slit = cube(root, 'Bishop diagonal mark', (.015,-.205,1.11), (.075,.025,.33), trim, .012)
        slit.rotation_euler.y = -.5
        sphere(root, 'Mitre finial', (0,0,1.39), .040, trim)
    elif kind == 'rook':
        lathe(root, 'Rook tower', [(.72,.20),(.79,.21),(1.10,.25),(1.16,.31),(1.22,.31)], body)
        for i in range(4):
            angle = i*math.pi/2
            block = cube(root, 'Rook battlement', (.235*math.cos(angle),.235*math.sin(angle),1.28), (.18,.18,.20), body, .025)
            block.rotation_euler.z = angle
        torus(root, 'Tower ring', (0,0,1.15), .29, .015, trim, STYLE == 'neon')
    else:
        lathe(root, 'Royal collar', [(.73,.22),(.80,.23),(.88,.14),(1.04,.15),(1.11,.27),(1.19,.27),(1.23,.19)], body)
        torus(root, 'Royal band', (0,0,1.13), .265, .025, trim, STYLE == 'neon')
        if kind == 'queen':
            for i in range(5):
                angle = i*2*math.pi/5
                sphere(root, 'Crown pearl', (.24*math.cos(angle),.24*math.sin(angle),1.34), .082, body)
            sphere(root, 'Queen finial', (0,0,1.43), .068, trim)
        else:
            sphere(root, 'King crown', (0,0,1.30), .14, body)
            cube(root, 'King vertical cross', (0,0,1.54), (.075,.10,.32), trim, .014)
            cube(root, 'King horizontal cross', (0,0,1.56), (.28,.10,.072), trim, .014)

def crown(root, key, z=.22):
    points = [(-.29,-.18),(-.35,.18),(-.17,.05),(0,.28),(.17,.05),(.35,.18),(.29,-.18)]
    obj = silhouette(root, 'Crown symbol', points, key, .025)
    obj.location.z = z

def token(root, color, crowned=False, disc=False):
    trim = 'blackEdge' if color == 'black' else 'whiteEdge'
    cylinder(root, 'Token rim', (0,0,.08), .54, .16, trim, .025)
    cylinder(root, 'Token face', (0,0,.17), .48, .11, color, .028)
    torus(root, 'Face groove', (0,0,.228), .38, .010, trim, STYLE == 'neon')
    if STYLE == 'arcade' and disc:
        cube(root, 'Arcade highlight', (0,-.24,.237), (.35,.035,.01), 'surface', .014)
    if crowned:
        crown(root, 'yellow', .24)

def sudoku_tile(root, digit=None, state='normal', shade=None):
    face = shade or ('selected' if state == 'selected' else 'surface')
    cube(root, 'Tile edge', (0,0,.035), (.98,.98,.10), 'frame', P['bevel'])
    cube(root, 'Tile face', (0,0,.087), (.91,.91,.065), face, P['bevel']*.8)
    ink = 'ink' if STYLE != 'neon' or state == 'selected' else 'white'
    if digit:
        text(root, str(digit), (0,0,.125), .60, 'error' if state == 'error' else ink)
    if state == 'notes':
        for digit, x, y in [(1,-.30,.28),(3,.30,.28),(7,-.30,-.28)]:
            text(root, str(digit), (x,y,.126), .19, ink)
    if state == 'error':
        cube(root, 'Error underline', (0,-.34,.134), (.45,.026,.025), 'error', .01)
    if state == 'selected':
        for x in [-.455,.455]:
            cube(root, 'Selected side', (x,0,.134), (.035,.88,.025), 'accent', .01)

def effect(root, kind):
    if kind == 'selection-ring':
        torus(root, 'Active ring', (0,0,.04), .54, .042, 'accent', True)
        for i in range(4):
            angle=i*math.pi/2
            sphere(root, 'Selection tick', (.63*math.cos(angle),.63*math.sin(angle),.04), .05, 'yellow')
    elif kind == 'timeline-portal':
        for i, (radius,key) in enumerate([(.57,'accent'),(.43,'secondary'),(.28,'yellow')]):
            torus(root, 'Timeline ring', (0,0,.04+i*.05), radius, .035, key, True)
        sphere(root, 'Timeline spark', (0,0,.25), .10, 'white')
    elif kind == 'crown-badge':
        cylinder(root, 'Achievement badge', (0,0,.05), .58, .10, 'frame', .035)
        torus(root, 'Badge rim', (0,0,.115), .52, .025, 'yellow', True)
        crown(root, 'yellow', .12)
    else:
        points = [(-.58,.15),(.20,.15),(.20,.02),(.56,.28),(.20,.54),(.20,.40),(-.58,.40)]
        silhouette(root, 'Forward shift arrow', points, 'accent', .07)
        second = silhouette(root, 'Return shift arrow', points, 'yellow', .07)
        second.rotation_euler.z = math.pi

LIBRARY, LIGHTS = scene(P['name']+' / Sprite library', True)
for side in ['white', 'black']:
    for kind in ['pawn','knight','bishop','rook','queen','king']:
        chess_piece(asset('chess-'+side+'-'+kind, 'chess'), kind, side)
for color in ['red','black']:
    for rank in ['man','king']:
        token(asset('checkers-'+color+'-'+rank, 'checkers'), color, rank == 'king')
for color in ['red','yellow']:
    token(asset('connect4-'+color+'-disc', 'connect4'), color, disc=True)
for digit in range(1,10):
    sudoku_tile(asset('sudoku-digit-'+str(digit), 'sudoku'), digit)
for state, digit in [('blank',None),('selected',5),('notes',None),('error',6)]:
    sudoku_tile(asset('sudoku-'+state, 'sudoku'), digit, state)
for kind in ['selection-ring','timeline-portal','shift-arrows','crown-badge']:
    effect(asset('fx-'+kind, 'effects'), kind)

for entry in ASSETS.values():
    entry['collection'].hide_render = True
for id, entry in ASSETS.items():
    if args.probe and id != 'chess-white-knight':
        continue
    center = entry['root'].location
    entry['collection'].hide_render = False
    if entry['family'] == 'chess':
        target=(center.x,center.y,.78);offset=(0,-5.5,3.1);scale=1.95
    elif entry['family'] == 'sudoku':
        target=(center.x,center.y,.09);offset=(0,-.1,6);scale=1.24
    else:
        target=(center.x,center.y,.12);offset=(0,-2.7,6);scale=1.48
    camera(LIBRARY,target,offset,scale)
    for light, position in zip(LIGHTS,[(-3,-4,7),(4,1,5)]):
        light.location=Vector(position)+Vector((center.x,center.y,0))
    render(LIBRARY,DEST/'sprites'/(id+'.png'),256)
    entry['collection'].hide_render = True

def instance(id, root, location, scale=1):
    prototype = ASSETS[id]['root']
    result = empty(id, root.users_collection[0], location)
    result.parent = root
    result.location = location
    result.scale = (scale,scale,scale)
    for original in prototype.children:
        obj = original.copy()
        obj.data = original.data
        root.users_collection[0].objects.link(obj)
        obj.parent = result
        obj.location = original.location
    return result

def stage(game):
    result, _ = scene(P['name']+' / '+game.title()+' concept')
    collection = bpy.data.collections.new(game+' board')
    result.collection.children.link(collection)
    root = empty(game+' board',collection)
    root['reference_position'] = FIXTURES[game]['description']
    cube(root,'Studio backdrop',(0,0,-.88),(50,50,.15),'background')
    return result,root

def square_board(root, timelines=False):
    if timelines:
        cube(root,'Earlier timeline',(.28,.34,-.39),(8.55,8.55,.12),'accent',.18)
        cube(root,'Parallel timeline',(.14,.17,-.25),(8.55,8.55,.12),'secondary',.18)
    cube(root,'Board frame',(0,0,-.13),(8.50,8.50,.25),'frame',.14)
    for row in range(8):
        for col in range(8):
            cube(root,f'Square {row}-{col}',(col-3.5,row-3.5,.012),(.995,.995,.055),'light' if (row+col)%2 else 'dark',.008)

def chess_board():
    result,root = stage('chess')
    square_board(root)
    kinds={'p':'pawn','n':'knight','b':'bishop','r':'rook','q':'queen','k':'king'}
    for square,piece in enumerate(FIXTURES['chess']['board']):
        if piece:
            side='white' if piece['color']=='w' else 'black'
            instance('chess-'+side+'-'+kinds[piece['type']],root,(square%8-3.5,square//8-3.5,.06),.75)
    camera(result,(0,0,.12),(0,-10,20),10.35)
    return result

def checkers_board():
    result,root = stage('checkers')
    square_board(root,True)
    for square,piece in enumerate(FIXTURES['checkers']['board']['cells']):
        if piece:
            color='red' if piece['player']==0 else 'black'
            rank='king' if piece['king'] else 'man'
            instance('checkers-'+color+'-'+rank,root,(square%8-3.5,square//8-3.5,.075),.84)
    camera(result,(0,.13,.12),(0,-7,20),10.1)
    return result

def connect4_board():
    result,root = stage('connect4')
    board=FIXTURES['connect4']['board']
    cols,rows=board['cols'],board['rows']
    for i,key in enumerate(['accent','secondary']):
        cube(root,'Parallel timeline '+str(i),(.14*(2-i),.20*(2-i),-.4+i*.14),(7.48,6.48,.10),key,.18)
    cube(root,'Socket shadows',(0,0,-.24),(7.30,6.30,.12),'frame',.15)
    plate=cube(root,'Socket plate',(0,0,0),(7.40,6.40,.35),'blue',.15)
    bpy.context.view_layer.objects.active=plate
    bpy.ops.object.modifier_apply(modifier=plate.modifiers[0].name)
    plate.modifiers.clear()
    cutters=[]
    for row in range(rows):
        for col in range(cols):
            cutters.append(cylinder(root,'Temporary socket cutter',(col-3,row-2.5,0),.392,1,None,0))
    bpy.ops.object.select_all(action='DESELECT')
    for cutter in cutters:
        cutter.select_set(True)
    bpy.context.view_layer.objects.active=cutters[0]
    bpy.ops.object.join()
    cutter=bpy.context.object
    mod=plate.modifiers.new('Actual board sockets','BOOLEAN')
    mod.operation='DIFFERENCE'
    mod.solver='EXACT'
    mod.object=cutter
    bpy.context.view_layer.objects.active=plate
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    bevel(plate,.014)
    for row in range(rows):
        for col in range(cols):
            player=board['cells'][row*cols+col]
            if player is not None:
                instance('connect4-'+('red' if player==0 else 'yellow')+'-disc',root,(col-3,row-2.5,.055),.70)
    camera(result,(0,.08,0),(0,-6,20),9.20)
    return result

def sudoku_board():
    result,root = stage('sudoku')
    board=FIXTURES['sudoku']
    cube(root,'Sudoku frame',(0,0,-.08),(9.42,9.42,.24),'frame',.16)
    for row in range(9):
        for col in range(9):
            square=row*9+col
            digit=board['values'][square]
            id='sudoku-digit-'+str(digit) if digit else 'sudoku-notes' if square==board['selected'] else 'sudoku-blank'
            tile=instance(id,root,(col-4,4-row,.075),.97)
            if square==board['selected']:
                for part in tile.children:
                    if part.name.startswith('Tile face'):
                        part.data=part.data.copy()
                        part.data.materials.clear()
                        part.data.materials.append(material('selected'))
                    elif part.name.startswith('Digit') and STYLE=='neon':
                        part.data=part.data.copy()
                        part.data.materials.clear()
                        part.data.materials.append(material('ink'))
    for pos in [-1.5,1.5]:
        cube(root,'Box divider vertical',(pos,0,.13),(.038,9.1,.12),'frame',.008)
        cube(root,'Box divider horizontal',(0,pos,.13),(9.1,.038,.12),'frame',.008)
    camera(result,(0,0,.1),(0,-2.5,20),10.65)
    return result

BOARDS={}
for game,builder in [('chess',chess_board),('checkers',checkers_board),('connect4',connect4_board),('sudoku',sudoku_board)]:
    if args.probe and game!='chess':
        continue
    result=builder()
    BOARDS[game]=result
    render(result,DEST/'boards'/(game+'.png'),1024)

if not args.probe:
    bpy.context.window.scene=LIBRARY
    for entry in ASSETS.values():
        entry['collection'].hide_render=False
    camera(LIBRARY,(39,36,.65),(0,-9,24),25)
    for light,position in zip(LIGHTS,[(34,31,14),(45,39,12)]):
        light.location=position
        light.data.energy=2500
        light.data.size=12
        light.rotation_euler=(Vector((39,36,.6))-light.location).to_track_quat('-Z','Y').to_euler()
    for candidate in list(bpy.data.scenes):
        if not candidate.objects:
            bpy.data.scenes.remove(candidate)
    bpy.context.window.scene=BOARDS['chess']
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(STYLE+'.blend')),compress=True)
    manifest={
        'style':STYLE,'name':P['name'],'description':P['description'],
        'generator':'Blender '+bpy.app.version_string,'renderEngine':'Cycles CPU',
        'source':str((SOURCE/(STYLE+'.blend')).relative_to(OUT)),
        'sprites':[{'id':id,'family':entry['family'],'file':str((DEST/'sprites'/(id+'.png')).relative_to(OUT)),'width':256,'height':256}for id,entry in ASSETS.items()],
        'boards':[{'game':game,'file':str((DEST/'boards'/(game+'.png')).relative_to(OUT)),'width':1024,'height':1024,'position':FIXTURES[game]['description'],'kind':'Concept render'}for game in BOARDS],
        'palette':P,'renderSeconds':round(time.monotonic()-STARTED,1),
    }
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('STYLE_COMPLETE',STYLE,'probe' if args.probe else 'full',round(time.monotonic()-STARTED,1),flush=True)
