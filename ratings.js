#!/usr/bin/env node
'use strict';

let HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:46.0) Gecko/20100101 Firefox/46.0'
};
let WAIT = 5 * 1000;

let fs = require('fs');
let moment = require('moment');
let request = require('request-promise');
let sequelize = require('sequelize');
let distributions = require('probability-distributions');

let db = new sequelize(process.env.DB);

let ratingsTable = db.define('rating', {
  id: { type: sequelize.INTEGER, primaryKey: true },
  teacherId: sequelize.INTEGER,
  teacherName: sequelize.STRING,
  class: sequelize.STRING,
  date: sequelize.DATE,
  overall: sequelize.FLOAT,
  difficulty: sequelize.FLOAT,
  comments: sequelize.TEXT,
  originalJson: sequelize.TEXT
});

let dbReadyPromise = db.sync();

let normal = (mean, sd) => {
  return distributions.rnorm(1, mean, sd)[0];
};

let wait = millis => {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
};

let requestRatingsPage = (tid, page) => {
  console.log(`Requesting tid=${tid} page=${page}`);
  let options = {
    uri: 'http://www.ratemyprofessors.com/paginate/professors/ratings',
    qs: {
      tid: tid,
      page: page
    },
    headers: HEADERS,
    json: true
  };
  let duration = Math.max(0, normal(WAIT, WAIT/3));
  console.log(`Waiting ${duration/1000.0} seconds`);
  return wait(duration)
  .then(() => request(options));
};

let requestRatings = (teacher, page = 1, ratings = []) => {
  return requestRatingsPage(teacher.teacherId, page)
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
    ratings = ratings.concat(res.ratings);
    if (res.remaining) {
      return requestRatings(teacher, page + 1, ratings);
    } else {
      return ratings;
    }
  });
};

let makeRating = (teacherId, teacherName, rmpRating) => {
  return ratingsTable.create({
    id: rmpRating.id,
    teacherId: teacherId,
    teacherName: teacherName,
    class: rmpRating.rClass,
    date: moment(rmpRating.rDate, 'MM/DD/YYYY').toDate(),
    overall: rmpRating.rOverall,
    difficulty: 5.0 - rmpRating.rEasy,
    comments: rmpRating.rComments,
    originalJson: JSON.stringify(rmpRating)
  });
}

let downloadTeacher = teacher => {
  console.log(`Downloading ${teacher.name}`);
  return requestRatings(teacher)
  .then(ratings => {
    let teacherId = teacher.teacherId;
    let teacherName = teacher.name;
    let insertions = ratings.map(rating => makeRating(teacherId, teacherName,
                                                      rating));
    return Promise.all(insertions);
  })
  .catch(err => {
    console.error(`Error on teacher tid=${teacher.tid} name=${teacher.name}:`);
    console.error(err);
  });
};

let downloadTeachers = teachers => {
  if (!teachers.length) {
    return Promise.resolve();
  }
  let teacher = teachers[0];
  return downloadTeacher(teacher)
  .then(() => downloadTeachers(teachers.slice(1)));
};

let downloadTeachersInDepartment = departmentJsonPaths => {
  if (!departmentJsonPaths.length) {
    return Promise.resolve();
  }
  let departmentJsonPath = departmentJsonPaths[0];
  let departmentJsonContent = fs.readFileSync(departmentJsonPath);
  let teachers = JSON.parse(departmentJsonContent);
  return dbReadyPromise
  .then(() => downloadTeachers(teachers))
  .then(() => downloadTeachersInDepartment(departmentJsonPaths.slice(1)));
};

let departmentPaths = fs.readdirSync('departments')
                        .map(file => `departments/${file}`);
let departmentJsonPaths = departmentPaths.filter(path => path.endsWith('.json'));

downloadTeachersInDepartment(departmentJsonPaths);
