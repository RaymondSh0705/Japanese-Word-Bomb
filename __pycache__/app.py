from flask import Flask, render_template, request, redirect, url_for
import JPDict

app = Flask(__name__)
@app.route("/", methods = ["POST", "GET"])
def index():
    render_template("index.html")
