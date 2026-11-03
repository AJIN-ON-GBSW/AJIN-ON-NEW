#!/usr/bin/env python3
"""Manage this checkout's local Spring API, React dev server, and PostgreSQL."""
from pathlib import Path
import json, os, shutil, signal, subprocess, sys, time, urllib.request
ROOT=Path(__file__).resolve().parent.parent
LOCAL=ROOT/'.local'
STATE=LOCAL/'processes.json'
COMPOSE=['docker','compose','-p','ajin-on','-f',str(ROOT/'compose.yaml')]
def alive(info):
    if not info:return False
    r=subprocess.run(['ps','-p',str(info['pid']),'-o','command='],capture_output=True,text=True)
    return r.returncode==0 and ' '.join(info['args']) in r.stdout
def executable(candidates):
    return next((str(p) for p in candidates if p and Path(p).is_file()),None)
def java25(candidates):
    import re
    for candidate in candidates:
        if not candidate or not Path(candidate).is_file():continue
        version=subprocess.run([str(candidate),'-version'],capture_output=True,text=True)
        match=re.search(r'version "(\d+)',version.stderr+version.stdout)
        if version.returncode==0 and match and int(match[1])>=25:return str(candidate)
    return None
def api_environment(compose_config):
    """Give Spring the same resolved DB settings that Compose reads from .env."""
    database=compose_config['services']['postgres']
    settings=database['environment']
    port=next(str(item['published']) for item in database['ports'] if int(item['target'])==5432)
    env=dict(os.environ)
    env.setdefault('DATABASE_URL','jdbc:postgresql://127.0.0.1:'+port+'/'+settings['POSTGRES_DB'])
    env.setdefault('DATABASE_USERNAME',settings['POSTGRES_USER'])
    env.setdefault('DATABASE_PASSWORD',settings['POSTGRES_PASSWORD'])
    return env
def main():
    action=sys.argv[1] if len(sys.argv)>1 else 'start'
    if action not in ['start','stop','status']:raise SystemExit('Usage: python3 scripts/dev.py start|stop|status')
    LOCAL.mkdir(exist_ok=True)
    state=json.loads(STATE.read_text()) if STATE.exists() else {}
    if action=='status':
        for name in ['api','frontend']:print(name+': '+('running' if alive(state.get(name)) else 'stopped'))
        return
    if action=='stop':
        for info in state.values():
            if alive(info):os.killpg(info['pid'],signal.SIGTERM)
        subprocess.run(COMPOSE+['stop'],cwd=ROOT,check=True)
        print('Stopped AJIN ON; PostgreSQL data preserved.');return
    compose_config=json.loads(subprocess.check_output(COMPOSE+['config','--format','json'],cwd=ROOT,text=True))
    api_env=api_environment(compose_config)
    subprocess.run(COMPOSE+['up','-d','--wait'],cwd=ROOT,check=True)
    node=executable([os.getenv('NODE_BINARY'),'/opt/homebrew/opt/node@24/bin/node',shutil.which('node')])
    java=java25([str(Path(os.getenv('JAVA_HOME','/nonexistent'))/'bin/java'),'/opt/homebrew/opt/openjdk@25/bin/java',shutil.which('java')])
    if not node or not java:raise SystemExit('Install Node24+ and Java25, then run npm ci.')
    if int(subprocess.check_output([node,'--version'],text=True).strip().lstrip('v').split('.')[0])<24:raise SystemExit('Node24+ required; set NODE_BINARY.')
    jar=ROOT/'backend/build/libs/ajin-on-api-0.1.0.jar'
    sources=list((ROOT/'backend/src').rglob('*'))+[ROOT/'backend'/name for name in ['build.gradle','settings.gradle','gradlew','gradle/wrapper/gradle-wrapper.properties']]
    if not alive(state.get('api')) and (not jar.exists() or any(p.is_file() and p.stat().st_mtime>jar.stat().st_mtime for p in sources)):
        env={**os.environ,'JAVA_HOME':str(Path(java).resolve().parent.parent)}
        subprocess.run(['./gradlew','bootJar','--console=plain'],cwd=ROOT/'backend',env=env,check=True)
    vite=next((p for p in [ROOT/'frontend/node_modules/vite/bin/vite.js',ROOT/'node_modules/vite/bin/vite.js'] if p.exists()),None)
    if not vite:raise SystemExit('Run npm ci first.')
    commands={'api':([java,'-jar',str(jar)],ROOT/'backend'),'frontend':([node,str(vite),'--host','127.0.0.1','--port','5175','--strictPort'],ROOT/'frontend')}
    for name,(args,cwd) in commands.items():
        if alive(state.get(name)):continue
        with (LOCAL/(name+'.log')).open('a') as log:
            proc=subprocess.Popen(args,cwd=cwd,env=api_env if name=='api' else None,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        state[name]={'pid':proc.pid,'args':args}
        STATE.write_text(json.dumps(state,indent=2))
    for _ in range(100):
        if not all(alive(state.get(n)) for n in commands):raise SystemExit('A service exited; inspect .local/api.log or frontend.log.')
        try:
            with urllib.request.urlopen('http://127.0.0.1:5175/actuator/health',timeout=1) as response:
                if json.load(response).get('status')=='UP':print('AJIN ON ready: http://127.0.0.1:5175/');return
        except OSError:pass
        time.sleep(.15)
    raise SystemExit('Startup health timed out; inspect .local logs.')
if __name__=='__main__':main()
