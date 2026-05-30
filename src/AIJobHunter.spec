# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\OneDrive\\Escritorio\\_Applications\\_AIHunter_v2.0\\src\\launch_dashboard.py'],
    pathex=[],
    binaries=[],
    datas=[('C:\\OneDrive\\Escritorio\\_Applications\\_AIHunter_v2.0\\src', 'src')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['config'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AIJobHunter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
