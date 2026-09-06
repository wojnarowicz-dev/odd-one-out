package fixture.types;

// The counterweight to TypesAlpha: the same method name on a different type,
// never paired with close. Its whole job is to be told apart from Alpha.
public class TypesBeta {

    private Beta handle;

    public void betaOpens1() {
        Beta handle = new Beta();
        handle.open();
    }

    public void betaOpens2() {
        Beta handle = new Beta();
        handle.open();
    }

    public void betaOpens3() {
        Beta handle = new Beta();
        handle.open();
    }

    public void betaOpens4() {
        Beta handle = new Beta();
        handle.open();
    }

    public void betaOpens5() {
        Beta handle = new Beta();
        handle.open();
    }

    public void betaOpens6() {
        Beta handle = new Beta();
        handle.open();
    }
}
