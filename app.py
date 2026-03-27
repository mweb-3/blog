from flask import Flask, render_template, request, redirect, make_response
import libsql_client
import humanize
from zoneinfo import ZoneInfo
from datetime import datetime, timezone
import os
import traceback

CT = ZoneInfo("America/Chicago")

app = Flask(__name__)

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

class Reply:
    def __init__(self, id, post_id, author, content, created_at, parent_id=None):
        self.id = id
        self.post_id = post_id
        self.author = author
        self.content = content
        self.parent_id = parent_id
        self.responses = []
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
    client.execute("""
        CREATE TABLE IF NOT EXISTS reply (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            visibility TEXT DEFAULT 'private',
            parent_id INTEGER
        )
    """)
    try:
        client.execute("ALTER TABLE reply ADD COLUMN visibility TEXT DEFAULT 'private'")
    except:
        pass
    try:
        client.execute("ALTER TABLE reply ADD COLUMN parent_id INTEGER")
    except:
        pass
    client.close()
except:
    pass

@app.route("/")
def index():
    client = get_db()
    result = client.execute("SELECT id, title, content, created_at FROM post ORDER BY created_at DESC")
    posts = rows_to_posts(result.rows)
    authorized = request.cookies.get('authorized')
    reply_counts = {}
    if authorized == 'true':
        for post in posts:
            r = client.execute("SELECT COUNT(*) FROM reply WHERE post_id = ?", [post.id])
            reply_counts[post.id] = r.rows[0][0]
    client.close()
    return render_template('index.html', posts=posts, humanize=humanize, authorized=authorized, reply_counts=reply_counts)

@app.route('/submit', methods=['POST'])
def submit():
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
    authorized = request.cookies.get('authorized') == 'true'
    if not authorized:
        client.close()
        return render_template('view.html', post=post, replies=[], authorized=False)
    r = client.execute("SELECT id, post_id, author, content, created_at, parent_id FROM reply WHERE post_id = ? ORDER BY created_at DESC", [id])
    all_replies = [Reply(row[0], row[1], row[2], row[3], row[4], row[5]) for row in r.rows]
    # Thread responses under their parents
    reply_map = {r.id: r for r in all_replies}
    top_level = []
    for reply in all_replies:
        if reply.parent_id and reply.parent_id in reply_map:
            reply_map[reply.parent_id].responses.append(reply)
        elif not reply.parent_id:
            top_level.append(reply)
    # Sort responses chronologically (oldest first)
    for reply in top_level:
        reply.responses.sort(key=lambda r: r.created_at)
    client.close()
    return render_template('view.html', post=post, replies=top_level, authorized=authorized)

@app.route('/api/reply', methods=['POST'])
def add_reply():
    post_id = request.form.get('post_id')
    author = request.form.get('author')
    content = request.form.get('content')
    parent_id = request.form.get('parent_id') or None
    client = get_db()
    client.execute("INSERT INTO reply (post_id, author, content, parent_id) VALUES (?, ?, ?, ?)", [post_id, author, content, parent_id])
    client.close()
    return redirect('/post/' + post_id + '?sent=1')

@app.route('/new')
def new_post():
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

    
@app.route('/api/delete', methods=['POST'])
def delete():
    post_id = request.form.get('post_id')
    client = get_db()
    client.execute("DELETE FROM post WHERE id = ?", [post_id])
    client.execute("DELETE FROM reply WHERE post_id = ?", [post_id])
    client.close()
    return redirect('/admin')

@app.route('/api/delete-all', methods=['POST'])
def delete_all():
    if request.cookies.get('authorized') != 'true':
        return redirect('/login')
    client = get_db()
    client.execute("DELETE FROM post")
    client.execute("DELETE FROM reply")
    client.execute("DELETE FROM sqlite_sequence WHERE name = 'post'")
    client.execute("DELETE FROM sqlite_sequence WHERE name = 'reply'")
    client.close()
    return redirect('/admin')

@app.errorhandler(Exception)
def handle_error(e):
    tb = traceback.format_exception(type(e), e, e.__traceback__)
    error_text = ''.join(tb)
    return render_template('error.html', error=error_text), getattr(e, 'code', 500)

if __name__ == '__main__':
    app.run(port='8080', debug=True)
