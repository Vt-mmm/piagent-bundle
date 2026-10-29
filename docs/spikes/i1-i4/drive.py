import os, pty, sys, time, select, re
agent = os.environ.get('SPIKE_AGENT_DIR','/tmp/piagent-spike-agent'); os.makedirs(agent, exist_ok=True)
env = dict(os.environ, PI_CODING_AGENT_DIR=agent, SPIKE_LOG=agent + '/log', TERM='xterm-256color', COLUMNS='120', LINES='40')
pid, fd = pty.fork()
if pid == 0:
    os.chdir('os.path.dirname(os.path.abspath(__file__))')
    os.execvpe('pi', ['pi', '--no-extensions', '-e', 'ext.mjs', '--offline'], env)
buf = b''
def pump(t):
    global buf
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try: buf += os.read(fd, 65536)
            except OSError: return
def send(s, t=2): os.write(fd, s.encode()); pump(t)
pump(5)
for cmd in sys.argv[1:]:
    buf = b''
    send(cmd); send('\r', 1.5); send('\r', 2)
    txt = re.sub(rb'\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07', b'', buf).decode('utf8', 'replace')
    print('== sent', repr(cmd)); print(txt[-600:])
os.write(fd, b'\x03\x03'); pump(1)
