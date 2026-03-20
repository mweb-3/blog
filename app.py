from flask import Flask, render_template, request, redirect, make_response
import libsql_client
import humanize
from zoneinfo import ZoneInfo
from datetime import datetime, timezone
import os

CT = ZoneInfo("America/Chicago")

app = Flask(__name__)

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

@app.route("/")
def index():
    client = get_db()
    result = client.execute("SELECT id, title, content, created_at FROM post ORDER BY created_at DESC")
    posts = rows_to_posts(result.rows)
    client.close()
    authorized = request.cookies.get('authorized')
    return render_template('index.html', posts=posts, humanize=humanize, authorized=authorized)

@app.route('/submit', methods=['POST'])
def submit():
    title = request.form.get('title')
    content = request.form.get('content')
    client = get_db()
    client.execute("INSERT INTO post (title, content) VALUES (?, ?)", [title, content])
    client.close()
    return redirect('/')

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
    return render_template('new.html')

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
    if request.form.get('username') == 'Tara':
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
    client.close()
    return redirect('/admin')
    

if __name__ == '__main__':
    app.run(port='8080', debug=True)
