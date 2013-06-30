Session.set("searchedForRepo", false);

// Main template
Template.main.showRepository = function() {
  return (window.location.pathname.length > 15);
}


Template.main.repository = function() {
  var repoId = window.location.pathname.substr(1);

  var repo = Repositories.findOne({_id: repoId});
  if (repo) {
    if (!repo.name) {
      var matches = /\/([^\/]+?)(?:.git)?$/.exec(repo.url);
      repo.name = matches[1];
    }

    Session.set("searchedForRepo", true);

    return repo;
  } else if (!Session.get("searchedForRepo")) {
    return { name: "Loading..." };
  } else {
    return { name: "Error: invalid repository ID" };
  }
};


Template.main.users = function() {
  var repoId = window.location.pathname.substr(1);

  var copies = WorkingCopies.find(
    { repositoryId: repoId },
    { sort:  { timestamp: -1 }}
  ).fetch();


  var userArray = [];

  copies.forEach(function(copy) {
    copy.commits = Commits.find(
      { _id: { $in: copy.commitIds } },
      { sort:  { timestamp: -1 }}
    ).fetch();

    var user = Users.findOne({ _id: copy.userId })

    if (!user) { console.log("Couldn't load user with ID", copy.userId, "from working copy", copy._id); }

    // TODO: total hack for demo purposes
    var lastPushedCommit = Commits.findOne (
      {repositoryId : repoId, userId : user._id, invalid: true},
      { sort : {timestamp : -1}}
    );

    userArray.push({
      "user": user,
      "workingCopy": copy,
      "lastPushedCommit" : lastPushedCommit,
      "gravatarHash": CryptoJS.MD5(user.email.trim().toLowerCase()).toString()
    });

    userArray.sort (function (a, b) {
      var wcA = a.workingCopy;
      var wcB = b.workingCopy;
      if (wcA.commits && wcA.commits.length && wcB.commits && wcB.commits.length) {
        return wcB.commits[0].timestamp - wcA.commits[0].timestamp;
      } else if (wcA.commits && wcA.commits.length) {
        return -1;
      } else if (wcB.commits && wcB.commits.length) {
        return 1;
      } else if (a.user.email > b.user.email) {
        return 1;
      } else {
        return -1;
      }
    });

  });

  console.log(userArray);
  return userArray;
};


var processCommitData = function(commit, workingCopy, isDone) {
  commit.timeago = moment.unix(commit.timestamp).fromNow();
  commit.branchName = workingCopy.branchName;
  commit.numBehind = workingCopy.fileStats.numBehind;
  commit.branchStyle = workingCopy.fileStats.numBehind > 0 ? "behind" : "";
  commit.iconType = isDone ? "push" : "save";
  // console.log(commit);
  return commit;
};


Template.user.uncommittedFiles = function() {
  if (!this.workingCopy) { console.log("No working copy to inspect!"); }

  var wc_timeago = moment(this.workingCopy.timestamp).fromNow();
  var result = {
    files: [],
    numBehind: this.workingCopy.fileStats.numBehind,
    branchStyle: this.workingCopy.fileStats.numBehind > 0 ? "behind" : "",
    branchName: this.workingCopy.branchName,
    iconType: "write"
  };

  if (this.workingCopy.gitDiff.length) {
    this.workingCopy.gitDiff.forEach(function(file) {
      file.timeago = moment(file.lastModified).fromNow();  // Last modified
      result.files.push(file);
    });
    result.firstFile = result.files.shift();
    return result;

  } else if (this.workingCopy.untrackedFiles.length) {
    this.workingCopy.untrackedFiles.forEach(function(f) {
      result.files.push({
        file: f.filename,
        timeago: moment(f.lastModified).fromNow()
      });
    });
    result.firstFile = result.files.shift();
    return result;

  } else {
    return false;
  }
};


Template.user.topItem = function() {
  console.log(this.lastPushedCommit);
  if (!this.workingCopy) { console.log("No working copy to inspect!"); }

  if (this.workingCopy.gitDiff.length || this.workingCopy.untrackedFiles.length) {
    return false;

  } else if(this.workingCopy.commits.length) {
    return processCommitData(this.workingCopy.commits[0], this.workingCopy);

  } else if (this.lastPushedCommit) {
    return processCommitData(this.lastPushedCommit, this.workingCopy, true);

  } else {
    return false;
  }
};

Template.user.allDone = function() {
    if (this.workingCopy.gitDiff.length || this.workingCopy.untrackedFiles.length || this.workingCopy.commits.length) {
        return false;
    }
    return { message: "Probably slacking..." };
}



Template.user.olderItems = function() {
  if (!this.workingCopy) { console.log("No working copy to inspect!"); }

  var first_historic_commit = 1;

  if (this.workingCopy.gitDiff.length || this.workingCopy.untrackedFiles.length) {
    first_historic_commit = 0;
  }

  var commits = [];
  var max = first_historic_commit + 3;

  if (Session.equals("openCopy", this.workingCopy._id)) {
    max = this.workingCopy.commits.length;
  }

  for (var i = first_historic_commit; i < max; i ++) {
    if (this.workingCopy.commits[i]) {
      var commit = processCommitData(this.workingCopy.commits[i], this.workingCopy);
      commits.push(commit);
    }
  }

  return commits;
};


Template.user.hasMore = function() {
  var first_historic_commit = 1;
  if (this.workingCopy.gitDiff.length || this.workingCopy.untrackedFiles.length) {
    first_historic_commit = 0;
  }
  return (this.workingCopy.commits.length > first_historic_commit + 3);
};


Template.user.showOrHide = function() {
  return (Session.equals("openCopy", this.workingCopy._id)) ? "Hide" : "Show";
};


Template.user.showingDiff = function() {
  return (Session.equals("openDiffCopy", this.workingCopy._id));
};


Template.user.fileDiff = function() {
  var output;
  this.workingCopy.gitDiff.forEach(function(diff) {
    if (Session.equals("openDiffFile", diff.file)) {
      output = diff.content;
    }
  });
  if (output) { return hljs.highlight("diff", output).value; }
};


Template.user.events({
  'click .more-text': function (evt) {
    if (Session.equals("openCopy", this.workingCopy._id)) {
      Session.set("openCopy", null);
    } else {
      Session.set("openCopy", this.workingCopy._id);
    }
  },
  'click .item.file': function (evt) {
    var rel = evt.target.getAttribute("rel");
    if (rel) {
      if (Session.equals("openDiffCopy", this.workingCopy._id)) {
        Session.set("openDiffCopy", null);
        Session.set("openDiffFile", null);
      } else {
        Session.set("openDiffCopy", this.workingCopy._id);
        Session.set("openDiffFile", rel);
      }
    }
  }
});


Template.branchChart.hasCommitsAhead = function() {
  if (!this.workingCopy) { console.log("No working copy to inspect!"); }

  return (this.workingCopy.fileStats.numAhead > 0);
};

Template.branchChart.commitsAhead = function() {
  var html = "";
  for (var i = 0; i < this.workingCopy.fileStats.numAhead; i ++) {
    html += "<div class=\"circle bottom-row\"></div>";
  }
  return html;
};

Template.branchChart.commitsBehind = function() {
  var html = "";
  for (var i = 0; i < this.workingCopy.fileStats.numBehind; i ++) {
    html += "<div class=\"circle top-row";
    if (i == this.workingCopy.fileStats.numBehind - 1) { html += " last"; }
    html += "\"></div>";
  }
  return html;
};


