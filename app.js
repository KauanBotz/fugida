var express = require('express')
var app = express()

require('dotenv').config()

var http = require('http')
var port = process.env.PORT || 3001

const expressLayouts = require('express-ejs-layouts');

app.use(expressLayouts);
app.set('layout', 'layouts/header');

// =================== STATIC ===================
app.use(express.static(__dirname + '/views'))
app.use(express.static(__dirname + '/public'))

// =================== DB ===================
var mysql = require('mysql')
var myConnection = require('express-myconnection')

var dbOptions = {
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT
}

app.use(myConnection(mysql, dbOptions, 'pool'))

// =================== VIEW ===================
app.set('view engine', 'ejs')

// =================== BODY ===================
var bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// =================== METHOD OVERRIDE ===================
var methodOverride = require('method-override')
app.use(methodOverride(function (req, res) {
	if (req.body && typeof req.body === 'object' && '_method' in req.body) {
		var method = req.body._method
		delete req.body._method
		return method
	}
}))

// =================== SESSION + AUTH ===================
var session = require('express-session')
var passport = require('passport')
var flash = require('connect-flash')
var cookieParser = require('cookie-parser')

app.use(cookieParser(process.env.SESSION_SECRET))

app.use(session({
	secret: process.env.SESSION_SECRET || 'segredo_fugida_dev',
	resave: false,
	saveUninitialized: false,
	cookie: { maxAge: 60000 }
}))

// Passport config
require('./config/passport')(passport)

app.use(passport.initialize())
app.use(passport.session())

app.use(flash())

// Variáveis globais p/ EJS
app.use((req, res, next) => {
	res.locals.user = req.user || null
	res.locals.success_msg = req.flash('success')
	res.locals.error_msg = req.flash('error')
	next()
})

// =================== ROUTES ===================
var index = require('./routes/index')

app.use('/', index)
app.use('/auth', require('./routes/auth'))

// =================== SERVER ===================
app.listen(port, () => {
	console.log('Server running at port ' + port)
})
