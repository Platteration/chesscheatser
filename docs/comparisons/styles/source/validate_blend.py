"""Read every generated .blend and verify scenes and external-file independence."""
from pathlib import Path
import json
import bpy

source=Path(__file__).resolve().parent
results=[]
for style in ['arcade','neon','porcelain']:
    path=source/(style+'.blend')
    bpy.ops.wm.open_mainfile(filepath=str(path))
    library=next(scene for scene in bpy.data.scenes if scene.name.endswith('/ Sprite library'))
    assets=[obj for obj in library.objects if obj.get('asset_id')]
    assert len(assets)==35,(style,len(assets))
    assert len(bpy.data.scenes)==5,(style,len(bpy.data.scenes))
    assert set(obj['family'] for obj in assets)=={'chess','checkers','connect4','sudoku','effects'}
    external_images=[image.filepath for image in bpy.data.images if image.source=='FILE' and image.filepath and not image.packed_file]
    external_fonts=[font.filepath for font in bpy.data.fonts if font.filepath and font.filepath!='<builtin>' and not font.packed_file]
    assert not external_images,(style,external_images)
    assert not external_fonts,(style,external_fonts)
    assert all(scene.camera and scene.render.engine=='CYCLES' for scene in bpy.data.scenes)
    result={'style':style,'scenes':len(bpy.data.scenes),'namedAssets':len(assets),'objects':len(bpy.data.objects),'externalImages':external_images,'externalFonts':external_fonts,'bytes':path.stat().st_size}
    results.append(result)
    print('SOURCE_VERIFIED',json.dumps(result),flush=True)
(source.parent/'blender-validation.json').write_text(json.dumps(results,indent=2)+'\n')
