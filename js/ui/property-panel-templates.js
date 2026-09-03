/**
 * 屬性面板 HTML 模板（純靜態字串，不含個案資料）。
 * [3-4 拆檔] 自 app.js 抽出；classic script 的頂層 const 為全域 lexical binding，app.js 直接使用。
 * 載入順序：必須在 js/app.js 之前。
 */
const PROPERTY_PANEL_TEMPLATES = Object.freeze({
    empty: '<p class="empty-hint">點選成員、關係線或圈選框以編輯屬性</p>',
    relationship: `
        <div class="property-form">
            <div class="form-group">
                <label>關係類型</label>
                <div class="relationship-type-row">
                    <div class="relationship-type-chip"><strong id="relationshipTypeName"></strong></div>
                    <button type="button" class="btn-cancel btn-compact" id="changeRelationshipTypeBtn" title="開啟關係類型清單">變更類型…</button>
                </div>
                <small id="relationshipEndpoints" style="color: var(--text-secondary); margin-top: 4px; display: block;"></small>
            </div>
            <div class="form-group" id="relationshipLinkTypeGroup" hidden>
                <label>子女線型</label>
                <div class="segmented" role="group" aria-label="子女線型">
                    <button type="button" class="segmented-btn" data-link-type="biological">親生</button>
                    <button type="button" class="segmented-btn" data-link-type="adopted">收養</button>
                    <button type="button" class="segmented-btn" data-link-type="foster">寄養</button>
                </div>
            </div>
            <div class="form-group" id="relationshipRouteGroup" hidden>
                <label>婚姻線走法</label>
                <div class="segmented" role="group" aria-label="婚姻線走法">
                    <button type="button" class="segmented-btn" data-route-mode="auto" title="依情況自動：同列淨空走直線、中間夾人時 ㄩ 下折、同側多婚架 ㄇ 天橋">自動</button>
                    <button type="button" class="segmented-btn" data-route-mode="over" title="ㄇ 上折（上方無父母線時才適用）">ㄇ</button>
                    <button type="button" class="segmented-btn" data-route-mode="straight" title="一 直線">一</button>
                    <button type="button" class="segmented-btn" data-route-mode="under" title="ㄩ 下折">ㄩ</button>
                </div>
                <div class="route-lift" id="relationshipLiftRow" title="ㄇ 天橋抬高 / ㄩ 下折加深；也可直接在畫布上按住橫桿上下拖動">
                    <span class="route-lift-label">橫桿距離</span>
                    <button type="button" class="segmented-btn" data-lift="-15" aria-label="橫桿靠近人物">－</button>
                    <span class="route-lift-value" id="relationshipLiftValue">0</span>
                    <button type="button" class="segmented-btn" data-lift="15" aria-label="橫桿遠離人物">＋</button>
                    <button type="button" class="segmented-btn" data-lift="reset">重設</button>
                </div>
            </div>
            <div class="form-group">
                <label for="relationshipDate">時間/說明 (顯示於線上)</label>
                <textarea id="relationshipDate" rows="2" placeholder="例如：結婚 2010 (換行) 離婚 2020"></textarea>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteRelationshipBtn" style="width: 100%;">刪除此關係</button>
            </div>
        </div>`,
    household: `
        <div class="property-form">
            <div class="form-group">
                <label for="householdLabel">名稱（顯示於框上，可空）</label>
                <input type="text" id="householdLabel" placeholder="例如：外婆家、安置機構、2024 起同住" autocomplete="off">
            </div>
            <div class="form-group">
                <label id="householdMemberCount"></label>
                <div id="householdMembers" class="household-members" aria-live="polite"></div>
                <div class="household-add-row">
                    <select id="householdAddSelect" aria-label="加入成員"><option value="">加入成員…</option></select>
                    <button type="button" class="btn-cancel btn-compact" id="householdAddBtn">加入</button>
                </div>
            </div>
            <div class="form-group">
                <label for="householdNotes">備註（僅面板顯示，不畫在圖上）</label>
                <textarea id="householdNotes" rows="2" placeholder="同住情形補充說明"></textarea>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteHouseholdBtn" style="width: 100%;">刪除此同住框</button>
            </div>
        </div>`,
    lifeCircle: `
        <div class="property-form">
            <div class="form-group">
                <label for="lifeCircleLabel">生活圈名稱（顯示於圈上）</label>
                <input type="text" id="lifeCircleLabel" placeholder="例如：學校、教會、社區據點">
            </div>
            <div class="form-group-row">
                <div class="form-group">
                    <label for="lifeCircleLabelPosition">名稱位置</label>
                    <select id="lifeCircleLabelPosition">
                        <option value="top">頂部（圈外上方）</option>
                        <option value="center">中央</option>
                        <option value="bottom">底部（圈外下方）</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>顏色</label>
                <div id="lifeCircleSwatches" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
            </div>
            <div class="form-group">
                <label for="lifeCircleNotes">說明（僅面板顯示，不畫在圖上）</label>
                <textarea id="lifeCircleNotes" rows="2" placeholder="例如：每週三下午課後照顧；聯絡人 ○○老師"></textarea>
            </div>
            <p class="property-help">選取後可拖曳頂點改形狀；雙擊邊線新增頂點；Alt＋點頂點刪除。</p>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteLifeCircleBtn" style="width: 100%;">刪除此生活圈</button>
            </div>
        </div>`,
    person: `
        <form class="property-form" id="personForm">
            <div class="form-group">
                <label for="personName">姓名/稱謂</label>
                <input type="text" id="personName" placeholder="輸入姓名">
            </div>
            <div class="form-group-row">
                <div class="form-group">
                    <label for="personAge">年齡</label>
                    <input type="number" id="personAge" min="0" max="150" placeholder="年齡">
                </div>
                <div class="form-group">
                    <label for="personGender">性別</label>
                    <select id="personGender">
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                    </select>
                </div>
            </div>
            <div class="form-group-row">
                <div class="form-group">
                    <label for="personBirthDate">出生年月</label>
                    <input type="text" id="personBirthDate" placeholder="例：1985 或 1985-06" inputmode="numeric" autocomplete="off">
                </div>
                <div class="form-group" id="personDeathDateGroup" hidden>
                    <label for="personDeathDate">死亡年月</label>
                    <input type="text" id="personDeathDate" placeholder="例：2020-03" inputmode="numeric" autocomplete="off">
                </div>
            </div>
            <p class="property-help" id="personAgeHint" hidden></p>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="personDeceased">
                    <label for="personDeceased">已過世</label>
                </div>
            </div>
            <div class="form-group">
                <label for="personLossType">生育結果</label>
                <select id="personLossType">
                    <option value="">正常</option>
                    <option value="miscarriage">流產（自然）</option>
                    <option value="abortion">人工流產</option>
                </select>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="personIP">
                    <label for="personIP">案主 / 關注對象</label>
                </div>
            </div>
            <div class="form-group">
                <label for="personNotes">備註</label>
                <textarea id="personNotes" rows="2" placeholder="備註 (顯示於姓名下方)"></textarea>
            </div>
            <div id="twinSettingsHost"></div>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">
            <h4 style="margin-bottom: 10px; font-size: 14px; color: var(--text-color);">醫學與狀態</h4>
            <div class="form-group">
                <label for="medLeftHalf">生理/心理疾病 (左半部)</label>
                <select id="medLeftHalf">
                    <option value="none">無</option>
                    <option value="striped">疑似 (斜線)</option>
                    <option value="filled">嚴重/確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="medBottomHalf">酒精/藥物濫用 (下半部)</label>
                <select id="medBottomHalf">
                    <option value="none">無</option>
                    <option value="striped">疑似 (斜線)</option>
                    <option value="filled">確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="medSmoker">
                    <label for="medSmoker">吸菸 (S)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medObese">
                    <label for="medObese">肥胖 (O)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medLang">
                    <label for="medLang">語言障礙 (L)</label>
                </div>
            </div>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">
            <div style="margin-top: 12px;">
                <button type="button" class="btn-cancel" id="deletePersonBtn" style="width: 100%;">刪除此成員</button>
            </div>
        </form>`
});
