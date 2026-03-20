from flask import Flask, render_template, request, redirect
from flask_sqlalchemy import SQLAlchemy
import humanize 
from zoneinfo import ZoneInfo
from datetime import datetime, timezone

CT = ZoneInfo("America/Chicago")

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blog.db'

db = SQLAlchemy(app)

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())



@app.route("/")
def index():
    posts = Post.query.all()
    
    return render_template('index.html', posts=posts, humanize=humanize)

@app.route('/submit', methods=['POST'])
def submit():
    if request.method == "POST":
        title = request.form.get('title')
        content = request.form.get('content')
        with app.app_context():
            post = Post(title=title, content=content)
            db.session.add(post)
            db.session.commit()
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
    post = Post.query.get(id)
    return render_template('view.html', post=post)

@app.route('/new')
def new_post():
    return render_template('new.html')

@app.route('/admin')
def admin():
    pass

if __name__ == '__main__':
    app.run(port='8080', debug=True)
