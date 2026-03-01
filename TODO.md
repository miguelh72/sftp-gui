# TODO

- after a trasnfer add a verification step that
    - makes sure all files were transfered and if not queued up the missing ones
    - makes sure all transfered files match in size with the original ones and if not requeues the wrong ones (careful not to include skipped override files and therefore override them!)
    - if it is unable on a second try to fix the problem, then
        - generate a error log in app data
        - send the user a toast with the local path to that error file and tell them that some files failed to transfer to to see details there 
- Add ESLint and Prettier rules for the project
- Change build to generate a single .exe file on Windows
- Add right-click context menu rename option
