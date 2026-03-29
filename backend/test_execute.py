from database import SessionLocal
from models import User, Group
from routes.execution_routes import _check_membership, _get_user_workspace, _write_workspace_to_disk, _run_in_docker
import tempfile
import shutil

db = SessionLocal()
group = db.query(Group).filter(Group.id == 2).first()
if not group:
    print("Group 2 not found!")
    exit(1)
user = db.query(User).filter(User.id == group.admin_id).first()
print(f"Testing with user: {user.username} (ID: {user.id})")

try:
    group, membership = _check_membership(user, 2, db)
    workspace = _get_user_workspace(user, group, db)
    print(f"Workspace has {len(workspace)} files.")
    
    temp_dir = tempfile.mkdtemp(prefix="test_exec_")
    _write_workspace_to_disk(workspace, temp_dir)
    print(f"Wrote to {temp_dir}")
    
    results = _run_in_docker(temp_dir)
    print("SUCCESS:")
    print(results)
    
except Exception as e:
    import traceback
    traceback.print_exc()

finally:
    try:
        shutil.rmtree(temp_dir)
    except:
        pass
        
