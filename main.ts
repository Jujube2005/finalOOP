import sqlite3 from "sqlite3";
import readline from "readline";

const db = new sqlite3.Database("./mission_app.db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// --------------------
// User Functions
// --------------------
async function createUser() {
  const name = await ask("Enter user name: ");

  return new Promise<void>((resolve, reject) => {
    // เช็คว่าชื่อซ้ำไหม
    db.get("SELECT * FROM user WHERE name = ?", [name], (err, row) => {
      if (err) return reject(err);
      if (row) {
        console.log("User already exists!");
        return resolve();
      }
      db.run(
        "INSERT INTO user (name) VALUES (?)",
        [name],
        function (err) {
          if (err) return reject(err);
          console.log(`User created with ID: ${this.lastID}`);
          resolve();
        }
      );
    });
  });
}

async function loginUser(): Promise<{ id: number; name: string } | null> {
  const name = await ask("Enter your username: ");
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM user WHERE name = ?", [name], (err, row: any) => {   // บอกว่า row เป็น any
    if (err) return reject(err);
    if (!row) {
      console.log("User not found!");
      return resolve(null);
    }
    console.log(`Logged in as ${row.name} (ID: ${row.user_id})`);
    resolve({ id: row.user_id, name: row.name });
  });
  });
}

// --------------------
// Mission Functions
// --------------------
async function createMission(userId: number) {
  const name = await ask("Enter mission name: ");
  const status = "not_started";
  return new Promise<void>((resolve, reject) => {
    db.run(
      "INSERT INTO mission (name, status, mission_leader_id) VALUES (?, ?, ?)",
      [name, status, userId],
      function (err) {
        if (err) return reject(err);
        console.log(`Mission "${name}" created with ID: ${this.lastID}`);
        resolve();
      }
    );
  });
}

async function joinMission(userId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM mission WHERE mission_id NOT IN 
       (SELECT mission_id FROM mission_member WHERE member_id = ?)`,
      [userId],
      async (err, missions) => {
        if (err) {
          console.error(err.message);
          return reject(err);
        }

        if (missions.length === 0) {
          console.log("No available missions to join!");
          return resolve();
        }

        console.log("\nAvailable Missions:");
        missions.forEach((m: any) => console.log(`${m.mission_id}: ${m.name}`));

        const missionId = parseInt(await ask("Enter mission ID to join: "));

        await new Promise<void>((res, rej) => {
          db.run(
            "INSERT OR IGNORE INTO mission_member (mission_id, member_id) VALUES (?, ?)",
            [missionId, userId],
            function (err) {
              if (err) {
                console.error(err.message);
                rej(err);
              } else {
                console.log("✅ You joined the mission!");
                res();
              }
            }
          );
        });
        resolve();
      }
    );
  });
}



async function startMission(userId: number) {
  try {
    const missions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM mission WHERE mission_leader_id = ?",
        [userId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });

    if (missions.length === 0) {
      console.log("No missions found for this leader!");
      return;
    }

    console.log("Your Missions:");
    missions.forEach((m) => console.log(`${m.mission_id}: ${m.name} [${m.status}]`));

    const missionId = parseInt(await ask("Enter mission ID to start: "));

    await new Promise<void>((resolve, reject) => {
      db.run(
        "UPDATE mission SET status = 'in_progress' WHERE mission_id = ? AND mission_leader_id = ?",
        [missionId, userId],
        function (err) {
          if (err) return reject(err);
          if (this.changes === 0) console.log("You can't start this mission!");
          else console.log("🚀 Mission started!");
          resolve();
        }
      );
    });
  } catch (err) {
    console.error("Error starting mission:", err);
  }
}


async function endMission(userId: number): Promise<void> {
  try {
    // ดึง mission ของ leader ที่กำลัง in_progress
    const missions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM mission WHERE mission_leader_id = ? AND status = 'in_progress'",
        [userId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    if (missions.length === 0) {
      console.log("No missions in progress for you to end.");
      return;
    }

    console.log("Your missions in progress:");
    missions.forEach((m) =>
      console.log(`${m.mission_id}: ${m.name} [${m.status}]`)
    );

    const missionIdInput = await ask("Enter mission ID to end: ");
    const missionId = parseInt(missionIdInput.trim(), 10);
    if (Number.isNaN(missionId)) {
      console.log("Invalid mission ID.");
      return;
    }

    // ตรวจสอบว่า mission ที่เลือกเป็นของ leader จริง ๆ
    const sel = missions.find((m) => m.mission_id === missionId);
    if (!sel) {
      console.log("Mission not found or not allowed to end.");
      return;
    }

    // อัปเดต status เป็น 'finished' ใน DB
    await new Promise<void>((resolve, reject) => {
      db.run(
        "UPDATE mission SET status = 'finished' WHERE mission_id = ? AND mission_leader_id = ?",
        [missionId, userId],
        function (err) {
          if (err) return reject(err);
          console.log(`✅ Mission ${missionId} ended (status = finished)`);
          resolve();
        }
      );
    });

    // แสดงสมาชิกใน mission
    const members = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT u.name FROM user u JOIN mission_member mm ON u.user_id = mm.member_id WHERE mm.mission_id = ?",
        [missionId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    console.log("Members in this mission:");
    if (members.length === 0) {
      console.log("- (no members)");
    } else {
      members.forEach((r) => console.log(`- ${r.name}`));
    }

    // สุ่มผลชนะ/แพ้ แสดงผลบน console
    const result = Math.random() < 0.5 ? "won" : "lost";
    console.log(`🎉 Mission result: ${result.toUpperCase()}`);

  } catch (err) {
    console.error("Error ending mission:", err);
  }
}


async function listAllMissions() {
  db.all("SELECT * FROM mission", [], (err, rows) => {
    if (err) return console.error(err.message);
    if (rows.length === 0) {
      console.log("No missions found.");
      return;
    }
    rows.forEach((m: any) => console.log(`\n${m.mission_id}: ${m.name}, Status: ${m.status}`));
  });
}

async function deleteMission(userId: number) {
  db.all(
    "SELECT * FROM mission WHERE mission_leader_id = ?",
    [userId],
    async (err, missions) => {
      if (err) return console.error(err.message);
      if (missions.length === 0) {
        console.log("No missions to delete!");
        return;
      }
      console.log("Your missions:");
      missions.forEach((m: any) => console.log(`${m.mission_id}: ${m.name}`));
      const missionId = parseInt(await ask("Enter mission ID to delete: "));
      db.run("DELETE FROM mission WHERE id = ?", [missionId], function (err) {
        if (err) console.error(err.message);
        else console.log("Mission deleted!");
      });
    }
  );
}

// --------------------
// Main Menu
// --------------------
async function missionMenu(user: { id: number; name: string }) {
  while (true) {
    console.log("\n=== MISSION MENU ===");
    console.log("1. Create Mission");
    console.log("2. Join Mission");
    console.log("3. Start Mission");
    console.log("4. End Mission");
    console.log("5. List All Missions");
    console.log("6. Delete Mission");
    console.log("7. Back to Main Menu");
    const choice = await ask("Select option: ");

    switch (choice) {
      case "1":
        await createMission(user.id);
        break;
      case "2":
        await joinMission(user.id);
        break;
      case "3":
        await startMission(user.id);
        break;
      case "4":
        await endMission(user.id);
        break;
      case "5":
        await listAllMissions();
        break;
      case "6":
        await deleteMission(user.id);
        break;
      case "7":
        return;
      default:
        console.log("Invalid option!");
    }
  }
}

async function mainMenu() {
  while (true) {
    console.log("\n=== MAIN MENU ===");
    console.log("1. Create User");
    console.log("2. Login User");
    console.log("3. Exit");
    const choice = await ask("Select option: ");

    switch (choice) {
      case "1":
        await createUser();
        break;
      case "2":
        const user = await loginUser();
        if (user) await missionMenu(user);
        break;
      case "3":
        console.log("Goodbye!");
        rl.close();
        db.close();
        return;
      default:
        console.log("Invalid option!");
    }
  }
}

mainMenu();
