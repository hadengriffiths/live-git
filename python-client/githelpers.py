#!/usr/bin/env python
"""
Scripts for retrieving data about the git repository
"""

from git import *
import os, sys
import gitstatus

def get_repo(dirpath):
    """
    Validates whether the script was run in a git repository,
    then returns the pygit2 Repo object
    """
    git_directory = os.path.join(dirpath + "/.git/")

    if not os.path.exists(git_directory):
        print "We couldn't find a .git/ directory in the current working directory. Are you in the root of the git repository?"
        sys.exit(1)    
    elif not os.path.isdir(git_directory):
        print "We found a file named .git/, but it should be a directory."
        sys.exit(1)

    return Repo.init(dirpath)


def get_computer_info(dirpath):
    """
    TODO
    """
    repo = get_repo(dirpath)

    # Read in git config
    config = repo.config_reader()
    user_name = config.get_value("user", "name")
    user_email = config.get_value("user", "email")
    origin_remote, remote_url = _get_remote_origin(repo)

    computer = {
        "name": user_name,
        "email": user_email,
        "remoteUrl": remote_url
    }
    
    return computer


def get_working_copy(params, dirpath):
    """
    Returns:
    """
    repo = get_repo(dirpath)

    # Gather branch information
    current_branch = repo.active_branch
    untracked = repo.untracked_files

    # In order to make sure that we have up to date information, we fetch
    origin_remote, remote_url = _get_remote_origin(repo)
    origin_remote.fetch()

    # Gather information about unpushed commits
    unpushed_commits = {}

    raw_unpushed_str = repo.git.log("origin/%s..HEAD" % current_branch.name)
    unpushed_hexshas = [line.split(" ")[1] for line in raw_unpushed_str.split('\n') 
            if line.startswith("commit")]
    unpushed_objs = [repo.commit(h) for h in unpushed_hexshas]

    if unpushed_objs:
        previous_commit = unpushed_objs[-1].parents[0] # First parent commit
    else:
        previous_commit = None

    unpushed_commits = []
    for u in unpushed_objs:
        unpushed_commits.append(_commit_to_dict(u, previous_commit))
        previous_commit = u

    # Information about the commits on that branch
    # Grab the commits in reverse chronological order
    # TODO: Deprecate "all commits" when we're sure it's no longer needed
    commits = []
    previous_commit = None  # Find diff relative to previous commit
    for c in repo.iter_commits():
        commit_info = _commit_to_dict(c, previous_commit)
        commits.append(commit_info)
        previous_commit = c

    # Pull statistics from the zsh git plugin (i.e. number of untracked)
    file_stats = gitstatus.get_statistics(dirpath)

    working_copy = {
            "computerId": params["computerId"],
            "branchName": current_branch.name,
            "remoteUrl": remote_url,
            "untrackedFiles": untracked,
            "unpushedCommits": unpushed_commits,
            "clientDir": dirpath,
            "fileStats": file_stats
    }

    return working_copy

def _commit_to_dict(c, previous_commit=None):
    """ 
    Converts a commit object to a dict that we can send to the server i

    Args: 
        c: pygit2 commit object
        previous_commit: another pygit2 commit object, used
            to find a diff
    """
    if previous_commit: 
        current_diffs = c.diff(previous_commit, create_patch=True)
        changed_files = [d.a_blob.name for d in current_diffs if d.a_blob]
        detailed_diffs = []

        for diff in current_diffs:
            # For now, ignore renamed, deleted files from detailed_diffs
            if diff.deleted_file or diff.renamed:
                continue

            # We can take a or b for the two diffs: 
            # take b, since new files don't have an a_blob
            filename = d.b_blob.name  
            detailed_diffs.append({
                "file": filename, 
                "content": diff.diff 
                }
            )
    else:
        detailed_diffs = []  # TODO make this based on the last pushed commit
        changed_files = []

    commit_info = {
            "clientHash": c.hexsha,
            "author": {
                "name": c.author.name,
                "email": c.author.email
            },
            "message": c.message,
            "timestamp": c.committed_date,
            "files": changed_files,
            "diff": detailed_diffs
    }
    return commit_info

def _get_remote_origin(repo):
    origin_remote = next((r for r in repo.remotes if r.name == 'origin'), None)
    if not origin_remote:
        print "This tool requires a remote branch named 'origin'"
        sys.exit(1)
    remote_url = origin_remote.url
    return origin_remote, remote_url
 
if __name__ == '__main__':
    print get_working_copy({})

