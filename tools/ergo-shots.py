import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        errs=[]
        pg = await b.new_page(viewport={'width':400,'height':820})
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)[:300]))
        await pg.goto('file:///home/claude/out/ma-table-demo.html'); await pg.wait_for_timeout(4000)
        fr = pg.frames[1] if len(pg.frames)>1 else pg.main_frame
        n=[0]
        async def shot(name):
            await pg.wait_for_timeout(700); await pg.screenshot(path=f'/tmp/shots/e-{name}.png')
        async def step(name, coro):
            try: await coro
            except Exception as e: errs.append(name+' '+str(e)[:120])
        await shot('accueil')
        await step('essayer', fr.get_by_label('Essayer sans table').click(timeout=4000)); await pg.wait_for_timeout(2500)
        await shot('niveau')
        await step('debute', fr.get_by_label('Je débute').click(timeout=4000))
        await shot('bienvenue')
        await step('passer', fr.get_by_text('Passer').click(timeout=3000))
        await shot('table')
        await step('reglages voie', fr.get_by_label('Réglages de Voix').click(timeout=3000))
        await shot('voie')
        await step('ok', fr.get_by_text('OK',exact=True).first.click(timeout=3000))
        await step('aide', fr.get_by_label('Aide').click(timeout=3000))
        await shot('aide')
        await step('comprends', fr.get_by_label('Je comprends').click(timeout=3000))
        await shot('aide2')
        await step('mots', fr.get_by_text('📖 Les mots de la table').click(timeout=3000))
        await shot('mots')
        await step('fermer', fr.get_by_label('Fermer').last.click(timeout=3000))
        await step('fermer2', fr.get_by_label('Fermer').last.click(timeout=3000))
        await step('plus', fr.get_by_label('Plus').click(timeout=3000))
        await shot('plus')
        await step('effets', fr.get_by_label('Effets').click(timeout=3000))
        await shot('effets')
        await step('plus', fr.get_by_label('Plus').click(timeout=3000))
        await step('reglages', fr.get_by_label('Réglages').click(timeout=3000))
        await shot('reglages')
        await step('gros', fr.get_by_label('Gros texte').click(timeout=3000))
        await step('table', fr.get_by_label('Table').click(timeout=3000))
        await shot('table-gros')
        print('\n'.join(errs) or 'ok'); await b.close()
asyncio.run(main())
