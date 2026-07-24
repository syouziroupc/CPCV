from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
issues=[]
files=sorted((ROOT/'public').rglob('*.html'))
for path in files:
    rel=path.relative_to(ROOT)
    soup=BeautifulSoup(path.read_text(encoding='utf-8'),'html.parser')
    if soup.html is None or soup.html.get('lang')!='ja': issues.append((str(rel),'html lang=ja missing'))
    viewport=soup.find('meta',attrs={'name':'viewport'})
    if not viewport: issues.append((str(rel),'viewport missing'))
    mains=soup.find_all('main')
    if len(mains)!=1: issues.append((str(rel),f'main count {len(mains)}'))
    h1=soup.find_all('h1')
    # SPA state pages may contain multiple hidden h1; require at least one.
    if not h1: issues.append((str(rel),'h1 missing'))
    ids={}
    for tag in soup.find_all(attrs={'id':True}): ids.setdefault(tag['id'],0); ids[tag['id']]+=1
    for ident,count in ids.items():
        if count>1: issues.append((str(rel),f'duplicate id {ident} x{count}'))
    labels={label.get('for') for label in soup.find_all('label') if label.get('for')}
    for tag in soup.find_all(['input','select','textarea']):
        if tag.get('type')=='hidden': continue
        ident=tag.get('id')
        wrapped=tag.find_parent('label') is not None
        named=bool(tag.get('aria-label') or tag.get('aria-labelledby') or (ident and ident in labels) or wrapped)
        if not named: issues.append((str(rel),f'unlabelled {tag.name}#{ident or "?"}'))
    for tag in soup.find_all(['button','a']):
        if tag.name=='a' and not tag.get('href'): continue
        name=' '.join(tag.get_text(' ',strip=True).split()) or tag.get('aria-label') or tag.get('title')
        if not name: issues.append((str(rel),f'unnamed {tag.name}'))

print(f'HTML files: {len(files)}')
if issues:
    for file,issue in issues: print(f'[FAIL] {file}: {issue}')
    print(f'Issues: {len(issues)}')
    raise SystemExit(1)
print('[PASS] Static HTML accessibility checks passed')
