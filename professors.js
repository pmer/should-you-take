#!/usr/bin/env node
'use strict';

let cheerio = require('cheerio');
let fs = require('fs');

let departmentPaths = fs.readdirSync('departments')
                        .map(file => `departments/${file}`);
let departmentHtmlPaths = departmentPaths.filter(arg => arg.endsWith('.html'));

for (let departmentHtmlPath of departmentHtmlPaths) {
  let departmentHtmlContent = fs.readFileSync(departmentHtmlPath);
  let departmentHtml = cheerio.load(departmentHtmlContent);
  let teacherElements = departmentHtml('a');
  let teachers = [];
  for (let i = 0; i < teacherElements.length; i++) {
    let teacherElement = teacherElements.eq(i);
    let showRatingsLink = teacherElement.attr('href');
    let teacherId = showRatingsLink.replace(/.*tid=(\d+).*/, '$1');
    let nameElement = teacherElement.children('.name');
    let name = nameElement.contents().slice(0, 1).text().trim();
    teachers.push({
      teacherId: teacherId,
      name: name
    });
  }
  let departmentJsonPath = departmentHtmlPath.replace('.html', '.json');
  fs.writeFileSync(departmentJsonPath, JSON.stringify(teachers, null, 2));
}
