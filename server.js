var express = require('express');
var bodyParser = require("body-parser");
var request = require('request');
var tough = require('tough-cookie');
var cheerio = require('cheerio');
var app = express();

var reqToken;
var baseUrl = 'https://www.osiris.universiteitutrecht.nl/osistu_ospr/';
var headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.81 Safari/537.36' };
var dbUrl = 'https://script.google.com/macros/s/AKfycbzAja36HGQfQwJk4qWJgSzL28vk_ZTOogLDxXXPHHKSuJjlWvLU/exec';

app.set('port', (process.env.PORT || 5000));
app.engine('html', require('ejs').renderFile);
app.set('views', __dirname + '/views');
app.set('view engine', 'html');
app.set('view cache', false);

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

var request = request.defaults({
  jar: true,                 // save cookies to jar
  rejectUnauthorized: false, 
  followAllRedirects: true   // allow redirections
});

app.get('/', function (req, res) {
  res.render('index');
});

app.post('/login', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;

  if (!username || !password) {
    res.send('<p>Please provide both username and password.</p>');
  }

  // GET request token
  request.get({ 
    url: baseUrl + 'Personalia.do',
    headers: headers
  }, function (err, res, html) {
    if (err) return;

    var $ = cheerio.load(html);
    reqToken = $('#requestToken').val();
  });

  var formData = {
    startUrl: 'Personalia.do',
    inPortal: '',
    callDirect: '',
    requestToken: reqToken,
    gebruikersNaam: username,
    wachtWoord: password,
    event: 'login'
  };

  // POST login
  request.post({ 
    url: baseUrl + 'AuthenticateUser.do', 
    headers: headers,
    form: formData 
  }, function (err, r, html) {
    if (err) return;

    $ = cheerio.load(html);
    if ($(".psbError")[0])
      return res.send($(".psbError").text());
    else
      res.render('questions', { username: username });

    // GET personalia
    request.get({
      url: baseUrl + 'ToonPersonalia.do',
      headers: headers
    }, function (err, r, html) {
      if (err) return;

      var $ = cheerio.load(html);
      var student = {
        "Student ID": $($(".psbTekst")[1]).text(),
        "Full name": $($(".psbTekst")[0]).text(),
        "First name": $($(".psbTekst")[3]).text(),
        "Degree programme": $($(".psbTekst")[6]).text()
      }

      request.post({
        url: dbUrl,
        body: { "data": [student], "sheet": "Student" },
        json: true
      }, function (err, r, html) {
        console.log(html);
      });
    });

    // GET grades
    request.get({
      url: baseUrl + 'ToonResultaten.do',
      headers: headers
    }, function (err, r, html) {
      if (err) return;

      var $ = cheerio.load(html);
      var results = [];
      $('tr', '#ResultatenPerStudent .OraTableContent').each(function (index, element) {
        if (index === 0) return;
        var result = {};
        result["Student ID"] = username;
        $(element).children().each(function (index, element) {
          switch (index) {
            case 1:
              result["Course ID"] = $(element).text().trim();
              break;
            case 7:
              result["Grade"] = $(element).text().trim();
              break;
            default:
              break;
          }
        });
        results.push(result);
      });

      request.post({
        url: dbUrl,
        body: { "data": results, "sheet": "Student_Course" },
        json: true
      }, function (err, r, html) {
        console.log(html);
      });
    });
  });
});

app.post('/answers', function (req, res) {
  var username = req.body.username;
  var profile = req.body.profile;
  var interest = req.body.interest;

  request.post({
    url: dbUrl,
    body: { 
      "data": [[ username, profile ]], 
      "sheet": "Student_Profile"
    },
    json: true
  }, function (err, r, html) {
    console.log(html);
  });

  var interests = [];
  interest.split(',').forEach(function (item) {
    interests.push(item.trim().toLowerCase());
  });

  var studentInterests = [];
  interests.forEach(function (item) {
    studentInterests.push([ req.body.username, item ]);
  })
  request.post({
    url: dbUrl,
    body: { "data": studentInterests, "sheet": "Student_Interest" },
    json: true
  }, function (err, r, html) {
    console.log(html);
  });

  var interestProfile = [];
  interests.forEach(function (item) {
    interestProfile.push([ item, profile ]);
  });
  request.post({
    url: dbUrl,
    body: { "data": interestProfile, "sheet": "Interest_Profile" },
    json: true
  }, function (err, r, html) {
    console.log(html);
  });

  res.redirect('/thankyou');
});

app.get('/thankyou', function (req, res) {
  res.render('thankyou');
});

app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'));
});
