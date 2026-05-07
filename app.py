from flask import Flask, render_template, request, redirect, make_response, jsonify
import libsql_client
import humanize
import requests
from zoneinfo import ZoneInfo
from datetime import datetime, timezone
import os
import re
import uuid
import traceback

CT = ZoneInfo("America/Chicago")

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
app.config['MAX_FORM_MEMORY_SIZE'] = 25 * 1024 * 1024

AUTH_KEY = os.getenv('AUTH_KEY')

def get_db():
    return libsql_client.create_client_sync(
        url=os.environ["TURSO_URL"],
        auth_token=os.environ["TURSO_TOKEN"]
    )

class Post:
    def __init__(self, id, title, content, created_at):
        self.id = id
        self.title = title
        self.content = content
        if isinstance(created_at, str):
            self.created_at = datetime.fromisoformat(created_at)
        else:
            self.created_at = created_at

def rows_to_posts(rows):
    return [Post(row[0], row[1], row[2], row[3]) for row in rows]

try:
    client = get_db()
    client.execute("""
        CREATE TABLE IF NOT EXISTS post (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    client.close()
except:
    pass

@app.context_processor
def inject_auth():
    return {'authorized': request.cookies.get('authorized') == 'true'}

@app.template_filter('summary')
def summary_filter(html):
    text = re.sub(r'<[^>]+>', ' ', html or '')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

@app.route("/")
def index():
    client = get_db()
    result = client.execute("SELECT id, title, content, created_at FROM post ORDER BY created_at DESC")
    posts = rows_to_posts(result.rows)
    client.close()
    return render_template('index.html', posts=posts, humanize=humanize)

@app.route('/submit', methods=['POST'])
def submit():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    title = request.form.get('title')
    content = request.form.get('content')
    client = get_db()
    client.execute("INSERT INTO post (title, content) VALUES (?, ?)", [title, content])
    result = client.execute("SELECT last_insert_rowid()")
    post_id = result.rows[0][0]
    client.close()
    return redirect('/post/' + str(post_id) + '?posted=1')

@app.template_filter('fmt_date')
def fmt_date(dt):
    local = dt.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("America/Chicago"))
    return local.strftime("%B %-d at %I:%M %p")

@app.template_filter('relative')
def relative(dt):
    local = dt.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("America/Chicago"))
    return humanize.naturaltime(local)

@app.route('/post/<int:id>')
def view(id):
    client = get_db()
    result = client.execute("SELECT id, title, content, created_at FROM post WHERE id = ?", [id])
    post = Post(result.rows[0][0], result.rows[0][1], result.rows[0][2], result.rows[0][3]) if result.rows else None
    client.close()
    return render_template('view.html', post=post)

@app.route('/new')
def new_post():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    return render_template('new.html')

@app.route('/edit/<int:id>')
def edit_post(id):
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    client = get_db()
    result = client.execute("SELECT id, title, content, created_at FROM post WHERE id = ?", [id])
    post = Post(result.rows[0][0], result.rows[0][1], result.rows[0][2], result.rows[0][3]) if result.rows else None
    client.close()
    return render_template('edit.html', post=post)

@app.route('/api/edit', methods=['POST'])
def update_post():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    post_id = request.form.get('post_id')
    title = request.form.get('title')
    content = request.form.get('content')
    client = get_db()
    client.execute("UPDATE post SET title = ?, content = ? WHERE id = ?", [title, content, post_id])
    client.close()
    return redirect('/post/' + post_id)

@app.route("/login")
def login():
    return render_template('login.html')

@app.route('/admin')
def admin():
    if request.cookies.get('authorized') == 'true':
        client = get_db()
        result = client.execute("SELECT id, title, content, created_at FROM post ORDER BY created_at DESC")
        posts = rows_to_posts(result.rows)
        client.close()
        return render_template('admin.html', posts=posts)
    else:
        return redirect('/login')

@app.route('/api/authorize', methods=['POST'])
def authorize():
    if request.form.get('username') == AUTH_KEY:
        resp = make_response(redirect('/admin'))
        resp.set_cookie('authorized', 'true')
        return resp
    else:
        return redirect('/')

@app.route('/deauth')
def deauth():
    resp = make_response(redirect('/'))
    resp.set_cookie('authorized', 'false')
    return resp


@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    if request.cookies.get('authorized') != 'true':
        return jsonify({'error': 'unauthorized'}), 401
    token = os.environ.get('BLOB_READ_WRITE_TOKEN')
    if not token:
        return jsonify({'error': 'blob storage not configured'}), 500
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'no file'}), 400

    mimetype = file.mimetype or 'application/octet-stream'
    ext = ''
    if file.filename and '.' in file.filename:
        ext = file.filename.rsplit('.', 1)[-1].lower()
    if not ext and '/' in mimetype:
        ext = mimetype.split('/', 1)[1]
    pathname = f'images/{uuid.uuid4().hex}.{ext or "bin"}'

    try:
        resp = requests.put(
            f'https://blob.vercel-storage.com/{pathname}',
            data=file.read(),
            headers={
                'authorization': f'Bearer {token}',
                'x-api-version': '7',
                'x-content-type': mimetype,
                'access': 'public',
                'x-add-random-suffix': '0',
            },
            timeout=30,
        )
    except Exception as e:
        return jsonify({'error': f'upload failed: {e}'}), 502
    if resp.status_code >= 300:
        return jsonify({'error': 'blob api error', 'status': resp.status_code, 'detail': resp.text}), 502
    data = resp.json()
    return jsonify({'url': data.get('url')})

@app.route('/api/delete', methods=['POST'])
def delete():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    post_id = request.form.get('post_id')
    client = get_db()
    client.execute("DELETE FROM post WHERE id = ?", [post_id])
    client.close()
    return redirect('/admin')

@app.route('/api/delete-all', methods=['POST'])
def delete_all():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    client = get_db()
    client.execute("DELETE FROM post")
    client.execute("DELETE FROM sqlite_sequence WHERE name = 'post'")
    client.close()
    return redirect('/admin')

@app.errorhandler(Exception)
def handle_error(e):
    tb = traceback.format_exception(type(e), e, e.__traceback__)
    error_text = ''.join(tb)
    return render_template('error.html', error=error_text), getattr(e, 'code', 500)

if __name__ == '__main__':
    app.run(port='8080', debug=True)
