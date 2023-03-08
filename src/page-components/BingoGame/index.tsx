import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./styles.module.less";
import AElf from "aelf-sdk";
import { SignIn } from "@portkey/did-ui-react";
import { did } from "@portkey/did-ui-react/src/utils/did";
import { getContractBasic, ContractBasic } from "@portkey/contracts";
import { DIDWalletInfo } from "@portkey/did-ui-react/src/components/types";
import { ChainInfo } from "@portkey/services";
import { useLocalStorage } from "react-use";
import { useDelay } from "hooks/common";
const { sha256 } = AElf.utils;

const bingoAddress = "2iNerrufZ7rQsj5Ea6Rpbi9G4GMNyTMNe9CBhBUocE9JHnUYJC";
const CHAIN_ID = "tDVV";

enum StepStatus {
  INIT,
  LOGIN,
  REGISTER,
  APPROVE,
  PLAY,
  BINGO,
}

const StepTextMap = {
  [StepStatus.INIT]: "Please wait...",
  [StepStatus.LOGIN]: "Login",
  [StepStatus.REGISTER]: "Register",
  [StepStatus.APPROVE]: "Approve",
  [StepStatus.PLAY]: "PLAY",
  [StepStatus.BINGO]: "BINGO",
};

export default function Home() {
  const caContractRef = useRef<ContractBasic>();
  const multiTokenContractRef = useRef<ContractBasic>();
  const loadingRef = useRef(false);
  const txIdRef = useRef("");
  const aelfRef = useRef<any>();
  const walletRef = useRef<DIDWalletInfo>();
  const chainInfoRef = useRef<ChainInfo>();
  const [isLoaderShow, setIsLoaderShow] = useState(false);
  const [balanceValue, setBalanceValue] = useState("loading...");
  const [balanceInputValue, setBalanceInputValue] = useState("");
  const [isSignInShow, setIsSignInShow] = useState<boolean>();
  const delay = useDelay();
  const [wallet, setWallet] = useLocalStorage<DIDWalletInfo | null>("wallet");
  const [stepStatus, setStepStatus] = useState<StepStatus>(StepStatus.INIT);

  const setLoading = useCallback((value: boolean) => {
    loadingRef.current = value;
    setIsLoaderShow(value);
  }, []);

  const init = useCallback(async () => {
    const chainsInfo = await did.services.getChainsInfo();
    const chainInfo = chainsInfo.find((chain) => chain.chainId === CHAIN_ID);
    if (!chainInfo) {
      alert("chain is not running");
      return;
    }
    chainInfoRef.current = chainInfo;

    const aelf = new AElf(new AElf.providers.HttpProvider(chainInfo.endPoint));
    aelfRef.current = aelf;
    if (!aelf.isConnected()) {
      alert("Blockchain Node is not running.");
      return;
    }
    setStepStatus(StepStatus.LOGIN);
  }, []);

  useEffect(() => {
    if (wallet) {
      walletRef.current = {
        ...wallet,
        walletInfo: {
          ...wallet.walletInfo,
          wallet: AElf.wallet.getWalletByPrivateKey(
            wallet.walletInfo.privateKey
          ),
        },
      } as any;
      console.log(walletRef.current, "====walletRef.current");
    }
    init();
  }, []);

  const initContract = useCallback(async () => {
    const chainInfo = chainInfoRef.current;
    const aelf = aelfRef.current;
    const wallet = walletRef.current;
    if (!aelfRef.current || !chainInfo?.caContractAddress || !wallet) return;
    if (loadingRef.current) return;
    setLoading(true);

    try {
      caContractRef.current = await getContractBasic({
        contractAddress: chainInfo?.caContractAddress,
        account: wallet.walletInfo.wallet,
        rpcUrl: chainInfo?.endPoint,
      });
      const chainStatus = await aelf.chain.getChainStatus();
      const zeroC = await getContractBasic({
        contractAddress: chainStatus.GenesisContractAddress,
        account: wallet.walletInfo.wallet,
        rpcUrl: chainInfo?.endPoint,
      });
      const tokenContractAddress = await zeroC.callViewMethod(
        "GetContractAddressByName",
        sha256("AElf.ContractNames.Token")
      );
      const multiTokenContract = await getContractBasic({
        contractAddress: tokenContractAddress.data,
        account: wallet.walletInfo.wallet,
        rpcUrl: chainInfo?.endPoint,
      });
      multiTokenContractRef.current = multiTokenContract;

      await delay();
      setStepStatus(StepStatus.REGISTER);
      console.log("initContract");
    } catch (error) {
      console.log("initContract: error", error);
    }

    setLoading(false);
  }, [delay, setLoading]);

  const getBalance = useCallback(async () => {
    const multiTokenContract = multiTokenContractRef.current;
    const wallet = walletRef.current;
    if (!multiTokenContract || !wallet) return 0;

    setBalanceValue("loading...");
    await delay();
    const result = await multiTokenContract.callViewMethod("GetBalance", {
      symbol: "ELF",
      owner: wallet.caInfo.caAddress,
    });

    console.log("getBalance: result", result);
    const balance = result.data.balance / 10 ** 8;
    const difference = balance - Number(balanceValue);
    setBalanceValue(balance.toString());
    return difference;
  }, [balanceValue, delay]);

  const register = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    if (!wallet || !caContract) return;
    if (loadingRef.current) return;
    setLoading(true);

    try {
      const registerResult = await caContract.callSendMethod(
        "ManagerForwardCall",
        wallet.walletInfo.wallet.address,
        {
          caHash: wallet.caInfo.caHash,
          contractAddress: bingoAddress,
          methodName: "Register",
          args: null,
        }
      );
      console.log("register: result", registerResult);
      await delay();
      alert("Congratulations on your successful registration！Please approve");
      setStepStatus(StepStatus.APPROVE);
      getBalance();
    } catch (error) {
      console.log("register: error", error);
    }

    setLoading(false);
  }, [delay, getBalance, setLoading]);

  const approve = useCallback(async () => {
    const wallet = walletRef.current;
    const caContract = caContractRef.current;
    const multiTokenContract = multiTokenContractRef.current;

    if (!caContract || !wallet || !multiTokenContract) return;
    if (loadingRef.current) return;
    setLoading(true);

    try {
      const approve = await caContract.callSendMethod(
        "ManagerForwardCall",
        wallet.walletInfo.wallet.address,
        {
          caHash: wallet.caInfo.caHash,
          contractAddress: multiTokenContract.address,
          methodName: "Approve",
          args: {
            symbol: "ELF",
            spender: bingoAddress,
            amount: "100000000000000000000",
          },
        }
      );
      console.log("approve: result", approve);
      getBalance();
      alert("Congratulations on your successful approve");
      setStepStatus(StepStatus.PLAY);
    } catch (error) {
      console.log("approve: error", error);
    }

    setLoading(false);
  }, [delay, getBalance, setLoading]);

  const onRegisterClick = useCallback(async () => {
    switch (stepStatus) {
      case StepStatus.LOGIN:
        if (walletRef.current) {
          initContract();
        } else {
          setIsSignInShow(true);
        }
        break;
      case StepStatus.REGISTER:
        register();
        break;
      case StepStatus.APPROVE:
        approve();
        break;
      default:
        break;
    }
  }, [stepStatus, initContract, register, approve]);

  const onPlay = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    if (!caContract || !wallet) return;

    const reg = /^[1-9]\d*$/;
    const value = parseInt(balanceInputValue, 10);
    if (value < 1) {
      return alert("A minimum bet of 1 ELFs!");
    }
    if (!reg.test(value.toString())) {
      alert("Please enter a positive integer greater than 0!");
      return;
    }
    if (value > Number(balanceValue)) {
      alert("Please enter a number less than the number of ELFs you own!");
      return;
    }

    if (loadingRef.current) return;
    setLoading(true);

    try {
      const playResult = await caContract.callSendMethod(
        "ManagerForwardCall",
        wallet.walletInfo.wallet.address,
        {
          caHash: wallet.caInfo.caHash,
          contractAddress: bingoAddress,
          methodName: "Play",
          args: {
            value: `${value * 10 ** 8}`,
          },
        }
      );

      console.log("Play result: ", playResult);
      txIdRef.current = playResult.data.TransactionId || "";
      await delay(4000);
      setStepStatus(StepStatus.BINGO);
    } catch (err) {
      console.log(err);
    }
    setLoading(false);
  }, [balanceInputValue, balanceValue, delay, setLoading]);

  const onBingo = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    const txId = txIdRef.current;
    if (!caContract || !wallet || !txId) return;
    if (loadingRef.current) return;
    setLoading(true);

    console.log("bingo: input", {
      caHash: wallet.caInfo.caHash,
      contractAddress: bingoAddress,
      methodName: "Bingo",
      args: txId,
    });
    try {
      const bingoResult = await caContract.callSendMethod(
        "ManagerForwardCall",
        wallet.walletInfo.wallet.address,
        {
          caHash: wallet.caInfo.caHash,
          contractAddress: bingoAddress,
          methodName: "Bingo",
          args: txId,
        }
      );
      console.log("Bingo: result", bingoResult);
      const difference = await getBalance();
      setStepStatus(StepStatus.PLAY);
      if (!difference) {
        alert("You got nothing");
      } else if (difference > 0) {
        alert(`Congratulations！！ You got ${difference} ELF`);
      } else if (difference < 0) {
        alert(`It’s a pity. You lost ${-difference} ELF`);
      }
    } catch (err) {
      console.log(err);
    }
    setLoading(false);
  }, [getBalance, setLoading]);

  const isLoginShow = useMemo(
    () =>
      [
        StepStatus.INIT,
        StepStatus.LOGIN,
        StepStatus.REGISTER,
        StepStatus.APPROVE,
      ].includes(stepStatus),
    [stepStatus]
  );

  return (
    <>
      <div className={styles.body}>
        <div className={styles.siteHeader}>
          <div className={styles.siteTitle}>Bingo Game</div>
          {isLoginShow && (
            <>
              <button
                className={styles.register}
                type="button"
                onClick={onRegisterClick}
              >
                {StepTextMap[stepStatus]}
              </button>
              <br />
              {wallet && (
                <button
                  className={styles.register}
                  type="button"
                  onClick={() => {
                    setWallet(null);
                    history.go(0);
                  }}
                >
                  Logout
                </button>
              )}
            </>
          )}
        </div>

        {!isLoginShow && (
          <div className={styles.siteBody}>
            <div className={styles.balance}>
              Your ELF: <span>{balanceValue}</span> ELF （Refresh page to
              restart）
            </div>
            <div className={styles.inputBox}>
              <input
                type="text"
                className={styles.inputWrap}
                value={balanceInputValue}
                placeholder="Please input amount"
                onChange={(e) => {
                  setBalanceInputValue(e.target.value);
                }}
              />
              <span className={[styles.inputBorder, styles.bottom].join(" ")} />
              <span className={[styles.inputBorder, styles.right].join(" ")} />
              <span className={[styles.inputBorder, styles.top].join(" ")} />
              <span className={[styles.inputBorder, styles.left].join(" ")} />
              <button
                type="button"
                className={styles.button}
                onClick={getBalance}
              >
                Get balance manually
              </button>
            </div>
            <div className={styles.buttonBox}>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue("30");
                }}
              >
                30
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue("50");
                }}
              >
                50
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue(
                    `${parseInt((Number(balanceValue) / 2).toString(), 10)}`
                  );
                }}
              >
                Half
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue(`${parseInt(balanceValue, 10)}`);
                }}
              >
                All-In
              </button>
            </div>
            <div>
              {stepStatus === StepStatus.PLAY && (
                <button className={styles.play} type="button" onClick={onPlay}>
                  Play
                </button>
              )}
            </div>
            <div>
              {stepStatus === StepStatus.BINGO && (
                <button className={styles.play} type="button" onClick={onBingo}>
                  Bingo
                </button>
              )}
            </div>
          </div>
        )}

        {isLoaderShow && (
          <div className={styles.loader}>
            <div className={styles.outer}></div>
            <div className={styles.middle}></div>
            <div className={styles.inner}></div>
          </div>
        )}

        <SignIn
          open={isSignInShow}
          sandboxId="portkey-ui-sandbox"
          chainId={CHAIN_ID}
          onFinish={(wallet) => {
            setIsSignInShow(false);
            console.log(wallet, "onFinish===");
            walletRef.current = wallet;
            setWallet(wallet);
            initContract();
          }}
          onError={(err) => {
            console.error(err, "onError==");
          }}
          onCancel={() => {
            setIsSignInShow(false);
          }}
        />
      </div>
    </>
  );
}
