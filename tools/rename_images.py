#!/usr/bin/env python3
"""Rename UUID image folder and files to descriptive names, update all HTML/CSS refs."""
import os
import re
import shutil

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site_mirror")
OLD_FOLDER_NAME = "bd091d31-1246-4632-8a74-63e47d82b93e"
NEW_FOLDER_NAME = "assets"

# First 8 hex chars of UUID → descriptive slug
UUID_MAP = {
    # From alt text
    "01f80bb9": "portret-na-18-urodziny",
    "07f8aac6": "pomysl-na-nowy-awatar",
    "0cab60ef": "portret-rodzinny-awatar-fb",
    "0f03cd78": "dla-pasjonata",
    "1825a145": "jaka-to-kreskowka",
    "1b202bcf": "w-prezencie-slubnym",
    "45e3d383": "dla-ukochanego-walentynki",
    "4625892c": "kubek-brzozinio-tyl",
    "476114d6": "kubek-grazyna-portret-przod",
    "4aefdad4": "prezent-dla-siostry",
    "55920e70": "maja-i-jej-pluszaki",
    "57a40e75": "kubek-kolaczkowska-cytat-tyl",
    "5f466309": "rysunek-zamiast-zdjecia-stylizacja",
    "62b74b98": "dla-corki-na-urodziny",
    "77f204b7": "kubek-chlopiec-kask-przod",
    "87531427": "na-rocznice-slubu",
    "8da9540a": "kartka-na-zyczenia-koperta",
    "99e0a604": "wychowawca-prezent-koniec-roku",
    "9a5604f7": "prezent-dla-przyjaciolki",
    "a8cb53aa": "kubek-miara-milosci-tyl",
    "a9c045d7": "electrowoman",
    "b3a32015": "zaskoczyc-meza",
    "b8a31ee4": "prezent-na-rocznice-slubu",
    "b8eb815b": "zeszyty-w-twardej-oprawie",
    "ba93a5fc": "w-prezencie-na-slub",
    "bd10346b": "kubek-metalowy-emaliowany",
    "c5a6701d": "kartka-komunia-fan-wojska",
    "c7317097": "prezent-dla-malej",
    "d3123785": "prezent-rocznica-midcentury",
    "d80a0e21": "kubek-emaliowany-zolnierz-tyl",
    "e5729550": "prezent-na-dzien-mamy",
    "f45ea243": "kubek-latte-i-podkladki",
    "fb00e2f3": "pelny-zestaw-notes-kubek-kartka",
    # Visually identified
    "04c07ea1": "portret-chlopiec-czerwona-czapka",
    "0e6bc215": "portret-kobieta-tablet-ciemne-tlo",
    "0ecb95b8": "portret-kobieta-kurtka-dzinsowa",
    "5353b784": "zeszyty-portrety-dwie-dziewczyny",
    "c73e4e3d": "portret-para-taniec-akwarela-baner",
    "d7f492a2": "portret-kobieta-bruneta-baner",
    "e29acb7a": "kartka-komunia-dziewczynka-biel",
    "eed4fafb": "owoce-ducha-pudelko-komunia",
    "05ce7493": "portret-grazyna-zolty-kapelusz",
    "110a8617": "portret-komunia-dziewczynka-wianek",
    "11b7602b": "portret-dziewczyna-kamizelka-czapka",
    "15385b7a": "portret-kobieta-ksiazki-ptak",
    "15f48c94": "zeszyty-portret-dziewczynka",
    "1682091c": "portret-trojka-twarze-na-plotnie",
    "18fd3a91": "portret-dziewczynka-rozowy-kwiaty",
    "20d56a00": "komiks-maly-ksiaze-lis",
    "2a005aaa": "kartka-komunia-chlopiec-zolnierz",
    "2e067f41": "podkladka-myszki-gamer-daniel",
    "3051174e": "kartka-slubna-para-rozyczki",
    "36c9e3d6": "opinia-sms-corka-chrzestna",
    "373ad723": "opinia-sms-naklejki-kubeczek",
    "3c6fa0bb": "komiks-swieta-planszowka-rodzina",
    "3f0baf88": "owoce-ducha-gra-karcianka",
    "419af816": "komiks-tato-szlaban-internet",
    "41ade122": "zeszyty-dwie-dziewczyny-kwiaty",
    "452ad734": "kubek-stasia-napis",
    "453e1b44": "portret-para-ramka-rocznica",
    "456018da": "owoce-ducha-pudelko-maly",
    "48b4f4b6": "portret-dziewczyna-koperta-wydruk",
    "48e3c9c1": "portret-kobieta-ruda-aparat",
    "4a095ff2": "opinia-sms-wiedzialem-dobre",
    "510ec5e4": "portret-chlopiec-zolnierz-naklejka",
    "529271da": "opinia-sms-cudnie-namalowala",
    "5605eb99": "kartka-komunia-chlopiec-bialy",
    "5b584402": "kartka-komunia-dziewczynka-rozowa",
    "5bcaa0b8": "opinia-sms-corka-zachwycona",
    "613bce12": "opinia-fb-matka-dziewczynki",
    "68840bf3": "kartka-slubna-para-koperta",
    "6b6adc08": "kubek-portret-chlopiec-czapka",
    "6c9bd423": "portret-para-mundur-slub-retro",
    "6e172ece": "naklejki-maks-zolnierz",
    "76ee40f3": "portret-grazyna-zestaw-ramka-kubek",
    "77ec2f21": "portret-para-slub-blondynka",
    "7f1b8993": "portret-kobieta-superbohaterka",
    "8137ef99": "opinia-sms-masz-talent",
    "8210b26e": "naklejki-zeszytowe-zolnierz",
    "8473d261": "portret-dziewczynka-rude-wlosy-baner",
    "8474f9a9": "portret-para-taniec-mlodzi",
    "915af63b": "portret-kobieta-tablet-opaska",
    "96a8c3ac": "opinia-sms-zonie-podobalo",
    "97439c9b": "komiks-trzej-krolowie-maseczki",
    "99fa74e5": "portret-para-superbohaterowie",
    "9b277151": "portret-chlopiec-sluchawki-polzonik",
    "9c67aee3": "portret-mezczyzna-lotnik-naklejka",
    "b33db499": "owoce-ducha-rozlozone",
    "b8ec15d8": "trzej-krolowie-pudelko",
    "b9bb75e7": "notes-maya-friends-naklejki",
    "be88d413": "portret-kobieta-blondynka-makijaz",
    "d08d6a1c": "naklejki-chlopiec-czapka-i-kartki",
    "d125b529": "portret-para-malzenstwo-cytat",
    "d13c0f10": "naklejki-grazyna-kapelusz",
    "d300fa7a": "kubek-chlopiec-sluchawki-w-rekach",
    "d4aab9df": "portret-dziewczynka-krecone-motyl",
    "da575cf2": "portret-rodzinny-trojka",
    "e433572d": "portret-rodzinny-mama-dzieci-ramka",
    "e4de4901": "grazyna-z-tabletem-kolory",
    "e77c1820": "portret-kobieta-tablet-blondynka",
    "e968e206": "notes-maya-naklejki-zeszytowe",
    "f7cb85b9": "komiks-mickiewicz-planszowka",
    "fc058a70": "portret-dziecko-miniatura",
}


def get_size_suffix(stem):
    """Return size suffix like _600, _1200, _rwc_1920, _carw_32, _orig."""
    m = re.search(r'_rw_(\d+)_h_', stem)
    if m:
        return '_' + m.group(1)
    m = re.search(r'_rwc_[0-9x]+x(\d+)_h_', stem)
    if m:
        return '_rwc_' + m.group(1)
    m = re.search(r'_carw_[0-9x]+x(\d+)_h_', stem)
    if m:
        return '_carw_' + m.group(1)
    if '_h_' in stem:
        return '_orig'
    return ''


def build_rename_map(old_folder):
    """Return {old_filename: new_filename} for all files in old_folder."""
    rename_map = {}
    slug_count = {}  # detect collisions

    for fname in sorted(os.listdir(old_folder)):
        uuid_short = fname[:8]
        ext = os.path.splitext(fname)[1]
        stem = os.path.splitext(fname)[0]

        if uuid_short in UUID_MAP:
            slug = UUID_MAP[uuid_short]
            size = get_size_suffix(stem)
            new_fname = slug + size + ext
        else:
            # CSS files and unknowns keep original name
            new_fname = fname

        # Collision check
        if new_fname in slug_count:
            print(f"  COLLISION: {fname} → {new_fname} (already mapped from {slug_count[new_fname]})")
        slug_count[new_fname] = fname

        rename_map[fname] = new_fname

    return rename_map


def update_references(rename_map):
    """Replace all old paths with new paths in HTML and CSS files under BASE."""
    old_folder = OLD_FOLDER_NAME
    new_folder = NEW_FOLDER_NAME

    # Build old_relative_path → new_relative_path substitution list
    # sorted longest-first to avoid partial matches
    subs = []
    for old_fname, new_fname in rename_map.items():
        subs.append((old_folder + "/" + old_fname, new_folder + "/" + new_fname))
    subs.sort(key=lambda x: len(x[0]), reverse=True)

    updated = 0
    for root, dirs, files in os.walk(BASE):
        # Skip the asset folders themselves
        for fname in files:
            if not (fname.endswith('.html') or fname.endswith('.css')):
                continue
            fpath = os.path.join(root, fname)
            try:
                content = open(fpath, encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            new_content = content
            for old, new in subs:
                new_content = new_content.replace(old, new)
            if new_content != content:
                open(fpath, 'w', encoding='utf-8').write(new_content)
                updated += 1
    print(f"  Updated {updated} HTML/CSS files")


def main():
    old_folder = os.path.join(BASE, OLD_FOLDER_NAME)
    new_folder = os.path.join(BASE, NEW_FOLDER_NAME)

    if not os.path.isdir(old_folder):
        print(f"ERROR: {old_folder} not found")
        return

    rename_map = build_rename_map(old_folder)

    print(f"Found {len(rename_map)} files to process")
    print("Sample renames:")
    for old, new in list(rename_map.items())[:8]:
        if old != new:
            print(f"  {old[:50]}... → {new}")

    os.makedirs(new_folder, exist_ok=True)

    # Copy files with new names
    copied = 0
    for old_fname, new_fname in rename_map.items():
        src = os.path.join(old_folder, old_fname)
        dst = os.path.join(new_folder, new_fname)
        if os.path.exists(dst):
            print(f"  SKIP (exists): {new_fname}")
            continue
        shutil.copy2(src, dst)
        copied += 1
    print(f"Copied {copied} files to {new_folder}")

    print("Updating HTML/CSS references...")
    update_references(rename_map)

    print(f"\nDone! Verify the result, then remove old folder:")
    print(f"  trash {old_folder}")


if __name__ == "__main__":
    main()
